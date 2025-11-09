// @ts-nocheck

/**
 * Traverses an expression AST to find all referenced table aliases.
 * @param {object} expr The expression AST node.
 * @param {Set<string>} refs A set to accumulate the found table aliases.
 */
function findExpressionRefs(expr, refs) {
    if (!expr) return;
    if (expr.type === 'column_ref' && expr.table) {
        refs.add(expr.table);
    }
    if (expr.left) findExpressionRefs(expr.left, refs);
    if (expr.right) findExpressionRefs(expr.right, refs);
    if (expr.expr) findExpressionRefs(expr.expr, refs);
    if (expr.args && expr.args.expr) findExpressionRefs(expr.args.expr, refs);
    if (Array.isArray(expr.exprs)) expr.exprs.forEach(e => findExpressionRefs(e, refs));
}

/**
 * Analyzes a subquery to find its correlation with the outer query.
 * @param {object} subqueryAst The AST of the subquery.
 * @param {Set<string>} outerTableAliases A set of table aliases available in the outer query scope.
 * @returns {object|null} Correlation details if found, otherwise null.
 */
function findCorrelation(subqueryAst, outerTableAliases) {
    const correlations = [];
    const subqueryTableAliases = new Set([
        ...subqueryAst.from.map(f => f.as),
        ...subqueryAst.joins.map(j => j.as)
    ]);
    
    // Traverse the subquery's WHERE clause to find predicates linking inner and outer tables.
    function traverse(predicate) {
        if (!predicate) return;
        if (predicate.type === 'binary_expr') {
            const leftRefs = new Set();
            findExpressionRefs(predicate.left, leftRefs);
            const rightRefs = new Set();
            findExpressionRefs(predicate.right, rightRefs);

            const leftIsOuter = [...leftRefs].some(r => outerTableAliases.has(r));
            const leftIsInner = [...leftRefs].some(r => subqueryTableAliases.has(r));
            const rightIsOuter = [...rightRefs].some(r => outerTableAliases.has(r));
            const rightIsInner = [...rightRefs].some(r => subqueryTableAliases.has(r));
            
            // A correlation predicate connects one inner and one outer table.
            if ((leftIsInner && rightIsOuter) || (leftIsOuter && rightIsInner)) {
                correlations.push(predicate);
                return; // This predicate is a correlation, don't look deeper
            }
        }
        if (predicate.left) traverse(predicate.left);
        if (predicate.right) traverse(predicate.right);
    }
    
    traverse(subqueryAst.where);
    
    if (correlations.length > 0) {
        // Remove correlation predicates from the subquery's own WHERE clause.
        const originalWhere = subqueryAst.where;
        const correlationSet = new Set(correlations);
        
        function filterWhere(predicate) {
            if (!predicate || correlationSet.has(predicate)) return null;
            if (predicate.type === 'and') {
                const newLeft = filterWhere(predicate.left);
                const newRight = filterWhere(predicate.right);
                if (newLeft && newRight) return { ...predicate, left: newLeft, right: newRight };
                return newLeft || newRight;
            }
            return predicate;
        }
        
        subqueryAst.where = filterWhere(originalWhere);
        return { predicates: correlations };
    }
    return null;
}

/**
 * Pre-processes an AST to find and rewrite correlated subqueries into joins.
 * @param {object} ast The main query AST.
 * @returns {object} The transformed AST.
 */
function decorrelateSubqueries(ast) {
    if (!ast.where) return ast;
    
    const outerTableAliases = new Set([
        ...ast.from.map(f => f.as),
        ...ast.joins.map(j => j.as)
    ]);
    
    // This function will be called recursively to traverse the WHERE clause tree.
    function transformPredicate(predicate) {
        if (!predicate) return null;

        if (predicate.type === 'exists_expr') {
            const correlation = findCorrelation(predicate.subquery, outerTableAliases);
            if (correlation) {
                // De-correlate! Rewrite the EXISTS subquery into a SEMI or ANTI join.
                if (correlation.predicates.length === 0) {
                    throw new Error('Found correlated subquery but could not extract correlation predicate.');
                }
                
                // For simplicity, we assume the first correlation predicate is the join condition.
                // A real engine would handle multiple predicates.
                const joinCondition = correlation.predicates[0];
                
                ast.joins.push({
                    type: predicate.not ? 'ANTI' : 'SEMI',
                    // The "table" is the subquery itself. We'll flatten its FROM/JOINs.
                    // This is a simplification; a real planner would create a sub-plan.
                    table: predicate.subquery.from[0].table,
                    as: predicate.subquery.from[0].as,
                    on: joinCondition,
                    // The subquery's own filters become part of the join operation.
                    filters: predicate.subquery.where ? [predicate.subquery.where] : [],
                });
                // Since we've transformed this predicate into a join, we remove it from the WHERE clause.
                return null;
            }
            // If not correlated, it can be executed once. For now, we leave it as is.
            return predicate;
        }
        
        // Recurse for AND/OR conditions
        if (predicate.left) predicate.left = transformPredicate(predicate.left);
        if (predicate.right) predicate.right = transformPredicate(predicate.right);

        // Filter out parts that were transformed (returned null)
        if (predicate.type === 'and') {
             if (!predicate.left) return predicate.right;
             if (!predicate.right) return predicate.left;
        }

        return predicate;
    }

    ast.where = transformPredicate(ast.where);
    return ast;
}


/**
 * Analyzes an expression from the AST to determine which tables it references.
 * @param {object} expr The AST expression node.
 * @param {Array<object>} from The list of tables in the FROM clause.
 * @param {Array<object>} joins The list of tables in JOIN clauses.
 * @returns {Array<string>} A list of table names referenced in the expression.
 */
function getReferencedTables(expr, from, joins) {
    const tables = new Set();
    if (!expr) return [];

    const allTables = [...from, ...joins.map(j => ({table: j.table, as: j.as}))];
    
    function traverse(node) {
        if (!node) return;
        if (node.type === 'column_ref' && node.table) {
            const tableInfo = allTables.find(t => t.as === node.table);
            if (tableInfo) {
                tables.add(tableInfo.table);
            }
        }
        if (node.left) traverse(node.left);
        if (node.right) traverse(node.right);
        if (node.expr) traverse(node.expr);
    }
    
    traverse(expr);
    return Array.from(tables);
}

/**
 * Checks if a predicate is a simple binary expression that can be converted
 * directly into a Mango selector by `buildSelector`.
 * @param {object} predicate The predicate AST node.
 * @returns {boolean} True if the predicate is simple enough for pushdown.
 */
function isSimplePredicate(predicate) {
    if (predicate && predicate.type === 'binary_expr' &&
        predicate.left && predicate.left.type === 'column_ref' &&
        predicate.right && predicate.right.type === 'param') {
            // Check for operators supported by buildSelector
            const supportedOps = ['=', '>', '<', '>=', '<='];
            return supportedOps.includes(predicate.operator);
    }
    return false;
}

function createSingleSelectPlan(ast) {
    // Before creating the plan, run the de-correlation pass.
    ast = decorrelateSubqueries(ast);

    const plan = {
        type: 'select',
        distinct: ast.distinct,
        fromTable: ast.from[0],
        joins: [],
        filters: {
            left: [],
            right: {},
            residual: []
        },
        projections: ast.columns,
        aggregation: null,
        orderBy: ast.orderBy,
        limit: ast.limit,
    };
    
    const fromTableName = ast.from[0].table;
    
    // Classify join predicates
    for (const join of ast.joins) {
        plan.joins.push({ ...join, filters: join.filters || [] });
    }
    
    // Unpack AND clauses into a flat list of predicates.
    const wherePredicates = [];
    function collectPredicates(p) {
        if (!p) return;
        if (p.type === 'and') {
            collectPredicates(p.left);
            collectPredicates(p.right);
        } else {
            wherePredicates.push(p);
        }
    }
    collectPredicates(ast.where);

    // Classify WHERE predicates
    for (const predicate of wherePredicates) {
        // Only simple predicates (e.g., col > literal) can be pushed down.
        // Complex predicates involving subqueries or functions become residual.
        const isSimple = isSimplePredicate(predicate);
        const referenced = getReferencedTables(predicate, ast.from, ast.joins);
        
        if (isSimple && referenced.length === 1 && referenced[0] === fromTableName) {
            plan.filters.left.push(predicate);
        } else if (isSimple && referenced.length === 1 && plan.joins.some(j => j.table === referenced[0])) {
             const join = plan.joins.find(j => j.table === referenced[0]);
             if(!plan.filters.right[join.table]) plan.filters.right[join.table] = [];
             plan.filters.right[join.table].push(predicate);
        } else {
            plan.filters.residual.push(predicate);
        }
    }
    
    // Setup aggregation
    const hasAggregates = ast.columns.some(c => c.expr.type === 'aggr_func');

    if (hasAggregates || ast.groupBy || ast.having) {
        // Semantic Validation for GROUP BY and aggregate functions
        if (ast.groupBy || hasAggregates) {
            const groupByCols = new Set(ast.groupBy ? ast.groupBy.columns.map(c => c.column) : []);
            for (const p of ast.columns) {
                if (p.expr.type !== 'aggr_func') {
                    // This is a regular column projection
                    const colName = p.as || p.expr.column;
                    if (!ast.groupBy) {
                        throw new Error(`Column '${colName}' is invalid in the select list because it is not contained in an aggregate function and there is no GROUP BY clause.`);
                    }
                    if (!groupByCols.has(p.expr.column)) {
                        throw new Error(`Column '${colName}' must appear in the GROUP BY clause or be used in an aggregate function.`);
                    }
                }
            }
        }
        
        plan.aggregation = {
            groupBy: ast.groupBy ? ast.groupBy.columns : [], // Empty array for scalar aggregation
            aggregates: ast.columns.filter(c => c.expr.type === 'aggr_func'),
            having: ast.having
        };
    }

    return plan;
}

/**
 * Creates a logical query plan from a list of Abstract Syntax Trees (ASTs) for a UNION query.
 * @param {Array<object>} astList The list of ASTs generated by the parser.
 * @returns {object} A query plan object for the executor.
 */
export function createPlan(astList) {
    if (!astList || astList.length === 0) return null;

    // Handle a single SELECT query (backwards compatibility)
    if (astList.length === 1 && astList[0].type === 'select') {
        const ast = astList[0];
        return createSingleSelectPlan(ast);
    }

    // It's a UNION query
    const plan = {
        type: 'union',
        selectPlans: [],
        unionOps: [],
        orderBy: null,
        limit: null,
    };
    
    // Create a map from the SelectAST object to its future index in selectPlans
    const selectAsts = astList.filter(ast => ast.type === 'select');
    const selectAstIndexMap = new Map();
    selectAsts.forEach((ast, index) => {
        selectAstIndexMap.set(ast, index);
    });

    plan.selectPlans = selectAsts.map(ast => createSingleSelectPlan(ast));

    const unionAsts = astList.filter(ast => ast.type === 'union');
    plan.unionOps = unionAsts.map(ast => {
        const topSelectAst = astList[ast.top];
        const bottomSelectAst = astList[ast.bottom];
        
        const topPlanIndex = selectAstIndexMap.get(topSelectAst);
        const bottomPlanIndex = selectAstIndexMap.get(bottomSelectAst);

        if (topPlanIndex === undefined || bottomPlanIndex === undefined) {
            throw new Error('Internal Planner Error: Could not map UNION AST to SELECT plans.');
        }

        return {
            distinct: ast.distinct,
            topPlanIndex,
            bottomPlanIndex,
        };
    });


    // According to SQL standard, ORDER BY and LIMIT in a UNION query apply to the entire result set
    // and can only appear at the very end.
    const lastSelectAst = astList[astList.length - 1];
    if (lastSelectAst.type === 'select') {
        plan.orderBy = lastSelectAst.orderBy;
        plan.limit = lastSelectAst.limit;
        
        // Remove from individual plan to avoid applying it early
        const lastSelectPlan = plan.selectPlans[plan.selectPlans.length - 1];
        if (lastSelectPlan) {
            lastSelectPlan.orderBy = null;
            lastSelectPlan.limit = null;
        }
    }

    return plan;
}
