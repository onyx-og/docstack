// @ts-nocheck
import { evalExpression, createRowEvaluator, evalAggregatedRowExpression } from './evaluator';
import { createAccumulators } from './accumulators';
import ClientStack from 'core/stack';

/**
 * An async version of Array.prototype.filter.
 * @param {Array<any>} arr The array to filter.
 * @param {function(any): Promise<boolean>} predicate An async function that returns a boolean.
 * @returns {Promise<Array<any>>} The filtered array.
 */
async function asyncFilter(arr, predicate) {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_v, index) => results[index]);
}


/**
 * Converts an array of AST predicate nodes into a PouchDB/Mango selector object.
 * This is a simplified implementation for basic equality and comparison operators.
 * @param {Array<object>} predicates An array of predicate nodes from the query plan.
 * @returns {object} A Mango selector object for filtering documents.
 */
function buildSelector(predicates) {
    if (!predicates || predicates.length === 0) return {};
    const selector = {};
    for (const pred of predicates) {
        // This is a simplified conversion from AST to Mango selector
        if (pred.type === 'binary_expr' && pred.left.type === 'column_ref') {
            const key = pred.left.column;
            const op = {
                '=': '$eq',
                '>': '$gt',
                '<': '$lt',
                '>=': '$gte',
                '<=': '$lte',
            }[pred.operator];
            if (op && pred.right.type === 'param') {
                 // For demo, we are assuming numeric/string literals.
                 let value = pred.right.value;
                 if(!isNaN(parseFloat(value))) value = parseFloat(value);
                 selector[key] = { [op]: value };
            }
        }
    }
    return selector;
}

/**
 * Transforms a set of rows by applying the projections from the SELECT clause.
 * Each row is reshaped to include only the specified columns, with aliasing.
 * @param {Array<object>} rows The input rows to process.
 * @param {Array<object>} projections The projection definitions from the query plan.
 * @param {string} fromAlias The alias for the FROM table.
 * @param {object} joinAliases A map of join table aliases.
 * @returns {Promise<Array<object>>} The transformed rows.
 */
async function applyProjections(rows, projections, fromAlias, joinAliases, stack, executePlan) {
    return Promise.all(rows.map(async (row) => {
        const newRow = {};
        for (const p of projections) {
            const alias = p.as || (p.expr.type === 'column_ref' ? p.expr.column : (p.expr.name || 'expr'));
            newRow[alias] = await evalExpression(row, p.expr, fromAlias, joinAliases, stack, executePlan, row);
        }
        return newRow;
    }));
}

/**
 * Removes duplicate rows from a result set, implementing SELECT DISTINCT.
 * @param {Array<object>} rows The rows to de-duplicate.
 * @returns {Array<object>} The de-duplicated rows.
 */
function applyDistinct(rows) {
    if (!rows || rows.length === 0) return [];

    const seen = new Set();
    const result = [];

    for (const row of rows) {
        // Create a stable key based on the row's values.
        // Sorting keys ensures that {a:1, b:2} and {b:2, a:1} are treated as the same.
        const key = JSON.stringify(Object.keys(row).sort().map(k => row[k]));
        if (!seen.has(key)) {
            seen.add(key);
            result.push(row);
        }
    }
    return result;
}

/**
 * Sorts a set of rows based on the ORDER BY clause.
 * @param {Array<object>} rows The rows to sort.
 * @param {Array<object>} orderBy The sorting criteria from the query plan.
 * @returns {Array<object>} The sorted rows.
 */
function applyOrderBy(rows, orderBy) {
    if (!orderBy) return rows;
    
    return [...rows].sort((a, b) => {
        for (const order of orderBy) {
            // We assume aliases from projection are now keys in the row object.
            const key = order.expr.column;
            const valA = a[key];
            const valB = b[key];
            
            let comparison = 0;
            if (valA < valB) comparison = -1;
            if (valA > valB) comparison = 1;
            
            if (comparison !== 0) {
                return order.order === 'DESC' ? -comparison : comparison;
            }
        }
        return 0;
    });
}

/**
 * Performs grouping and aggregation on a set of rows.
 * Implements GROUP BY, aggregate functions (COUNT, SUM, etc.), and HAVING.
 * @param {Array<object>} rows The input rows.
 * @param {object} aggregation The aggregation plan, including group by keys and aggregates.
 * @param {string} fromAlias Alias of the FROM table.
 * @param {object} joinAliases Map of join table aliases.
 * @returns {Promise<Array<object>>} The aggregated result rows.
 */
async function applyAggregation(rows, aggregation, fromAlias, joinAliases, stack, executePlan) {
    const { groupBy, aggregates, having } = aggregation;

    // Handle scalar aggregation on an empty result set (e.g., SELECT COUNT(*) FROM empty_table).
    // SQL expects one row with initial values (COUNT=0, SUM=NULL, etc.).
    if (rows.length === 0 && groupBy.length === 0) {
        const accumulators = createAccumulators(aggregates, fromAlias, joinAliases);
        const initialRow = {};
        await Promise.all(accumulators.map(async acc => {
             initialRow[acc.alias] = await acc.result();
        }));
        
        // If there's a HAVING clause, it must be evaluated against this initial row.
        if (having) {
            const aggregateAliasMap = new Map();
            (aggregates || []).forEach(agg => {
                const key = JSON.stringify(agg.expr);
                const alias = agg.as || agg.expr.name;
                aggregateAliasMap.set(key, alias);
            });
            
            if (evalAggregatedRowExpression(initialRow, having, aggregateAliasMap)) {
                return [initialRow];
            }
            return []; // The initial row did not satisfy the HAVING condition.
        }
        
        return [initialRow];
    }
    
    const groups = new Map();
    for (const row of rows) {
        const keyParts = await Promise.all(groupBy.map(gb => evalExpression(row, gb, fromAlias, joinAliases, stack, executePlan, row)));
        const key = JSON.stringify(keyParts);

        if (!groups.has(key)) {
            groups.set(key, {
                accumulators: createAccumulators(aggregates, fromAlias, joinAliases),
                keyValues: keyParts,
            });
        }
        const group = groups.get(key);
        for(const acc of group.accumulators) {
            await acc.add(row);
        }
    }

    let resultRows = [];
    
    // Create a map from aggregate function AST to its final alias for HAVING clause evaluation.
    const aggregateAliasMap = new Map();
    (aggregates || []).forEach(agg => {
        const key = JSON.stringify(agg.expr);
        const alias = agg.as || agg.expr.name;
        aggregateAliasMap.set(key, alias);
    });

    for (const group of groups.values()) {
        const resultRow = {};
        // Add group by keys to result
        groupBy.forEach((gb, i) => {
            const alias = gb.as || gb.column;
            resultRow[alias] = group.keyValues[i];
        });
        // Add aggregate results
        await Promise.all(group.accumulators.map(async acc => {
            resultRow[acc.alias] = await acc.result();
        }));
        resultRows.push(resultRow);
    }
    
    // Apply HAVING clause filter
    if (having) {
        resultRows = resultRows.filter(row => {
            // Use the new, specialized evaluator for aggregated rows.
            return evalAggregatedRowExpression(row, having, aggregateAliasMap);
        });
    }

    return resultRows;
}


async function executeSingleSelectPlan(stack: ClientStack, plan, params, outerRow, outerAliases) {
    // 1. Fetch from table
    const fromClass = await stack.getClass(plan.fromTable.table);
    if (!fromClass) throw new Error(`Table not found: ${plan.fromTable.table}`);

    const leftSelector = buildSelector(plan.filters.left);
    console.log("Left selector", {planFiltersLeft: plan.filters.left})
    let leftRows = (await fromClass.getCards(leftSelector)).map(row => ({ [plan.fromTable.as || plan.fromTable.table]: row }));

    // 2. Execute Joins
    let currentResultRows = leftRows;
    for (const join of plan.joins) {
        const rightClass = await stack.getClass(join.table);
        if (!rightClass) throw new Error(`Table not found: ${join.table}`);
        
        const joinAlias = join.as || join.table;
        const fromAlias = plan.fromTable.as || plan.fromTable.table;

        // Combine base table filters with filters from the subquery's WHERE clause
        const rightBaseSelector = buildSelector(plan.filters.right[join.table] || []);
        const subqueryFilterSelector = buildSelector(join.filters || []);
        const finalRightSelector = {...rightBaseSelector, ...subqueryFilterSelector};

        const allRightRows = await rightClass.getCards(finalRightSelector);
        
        if (join.type === 'SEMI' || join.type === 'ANTI') {
            let resultRows;
        
            if (join.on.operator === 'IN') {
                 // This logic handles correlated `IN` where an inner table column
                // is checked against an outer table column that is an array.
                // e.g., WHERE EXISTS (SELECT 1 FROM Actor a WHERE a._id IN m.actors AND ...)
                const rightRowIds = new Set(allRightRows.map(r => r._id));

                resultRows = await asyncFilter(currentResultRows, async (leftRow) => {
                    // right side of IN is the outer table array, e.g., m.actors
                    const outerArray = await evalExpression(leftRow, join.on.right, fromAlias, {}, stack, executePlan, leftRow);
                    if (!Array.isArray(outerArray)) {
                        return join.type === 'ANTI'; // No match if not an array
                    }

                    const matchFound = outerArray.some(id => rightRowIds.has(id));

                    return (join.type === 'SEMI') ? matchFound : !matchFound;
                });
            } else { // Handle standard equi-join correlations like `a.name = m.title`
                const rightRowMap = new Map();
                const rightJoinKeyExpr = join.on.right;
                
                // 1. Build a map from the right-side rows, keyed by their join attribute.
                await Promise.all(allRightRows.map(async rightRow => {
                    const key = await evalExpression({ [joinAlias]: rightRow }, rightJoinKeyExpr, fromAlias, { [joinAlias]: join.table }, stack, executePlan, { [joinAlias]: rightRow });
                    rightRowMap.set(key, true);
                }));
        
                // 2. Filter the left-side rows by probing the map.
                resultRows = await asyncFilter(currentResultRows, async (leftRow) => {
                    // Evaluate the join key expression (e.g., a.name) on the left row.
                    const key = await evalExpression(leftRow, join.on.left, fromAlias, {}, stack, executePlan, leftRow);
                    const matchFound = rightRowMap.has(key);
        
                    return (join.type === 'SEMI') ? matchFound : !matchFound;
                });
            }
            
            currentResultRows = resultRows;
            continue; // Skip to next join
        }


        const rightRowMap = new Map(allRightRows.map(r => [r._id, r]));
        let newResultRows = [];
        const matchedRightIds = new Set();

        for(const leftRow of currentResultRows) {
            let matchFoundForLeftRow = false;
            
            // This logic is specific to the `ON a._id IN m.actors` pattern
            const fk_list = await evalExpression(leftRow, join.on.right, fromAlias, {}, stack, executePlan, leftRow);
            if (join.on.operator === 'IN' && Array.isArray(fk_list)) {
                for(const fk of fk_list) {
                    if (rightRowMap.has(fk)) {
                        newResultRows.push({...leftRow, [joinAlias]: rightRowMap.get(fk)});
                        matchFoundForLeftRow = true;
                        if (join.type === 'RIGHT') {
                            matchedRightIds.add(fk);
                        }
                    }
                }
            }
            
            if (!matchFoundForLeftRow && join.type === 'LEFT') {
                const nullRightRow = { [joinAlias]: null };
                newResultRows.push({ ...leftRow, ...nullRightRow });
            }
        }
        
        if (join.type === 'RIGHT') {
            for (const rightRow of allRightRows) {
                if (!matchedRightIds.has(rightRow._id)) {
                    // Create a row with nulls for all fields that have been accumulated so far.
                    const nullLeftRow = {};
                    const leftSchemaAliases = [plan.fromTable.as || plan.fromTable.table];
                    const previousJoins = plan.joins.slice(0, plan.joins.indexOf(join));
                    previousJoins.forEach(pj => leftSchemaAliases.push(pj.as || pj.table));
                    
                    leftSchemaAliases.forEach(alias => {
                        nullLeftRow[alias] = null;
                    });

                    newResultRows.push({ ...nullLeftRow, [joinAlias]: rightRow });
                }
            }
        }
        
        currentResultRows = newResultRows;
    }
    let joinedRows = currentResultRows;
    
    // 3. Apply residual filters
    let filteredRows = joinedRows;
    console.log("Got residuals", {residual: plan.filters.residual});
    if (plan.filters.residual.length > 0) {
        const evaluators = plan.filters.residual.map(predicate => createRowEvaluator(predicate, stack, executePlan, outerRow, null));
        filteredRows = await asyncFilter(joinedRows, async (row) => {
            for (const evaluator of evaluators) {
                if (!(await evaluator(row))) {
                    return false;
                }
            }
            return true;
        });
    }

    let finalRows = filteredRows;

    // 4. Aggregation
    if (plan.aggregation) {
        const fromAlias = plan.fromTable.as || plan.fromTable.table;
        const joinAliases = plan.joins.reduce((acc, j) => ({ ...acc, [j.as || j.table]: j.table }), {});
        finalRows = await applyAggregation(filteredRows, plan.aggregation, fromAlias, joinAliases, stack, executePlan);
    }
    
    // 5. Projections
    let projectedRows;
    if (plan.aggregation) {
        // Projection is handled inside aggregation for aliasing group keys and agg results.
        // Here we just re-alias if needed.
        projectedRows = await Promise.all(finalRows.map(async row => {
            const newRow = {};
            for(const p of plan.projections) {
                const colName = p.expr.column || p.expr.name;
                const alias = p.as || colName;
                if(row.hasOwnProperty(colName)) {
                     newRow[alias] = row[colName];
                } else if(row.hasOwnProperty(alias)) {
                    newRow[alias] = row[alias];
                }
            }
            return newRow;
        }));

    } else {
        const fromAlias = plan.fromTable.as || plan.fromTable.table;
        const joinAliases = plan.joins.reduce((acc, j) => ({ ...acc, [j.as || j.table]: j.table }), {});
        projectedRows = await applyProjections(finalRows, plan.projections, fromAlias, joinAliases, stack, executePlan);
    }
    
    // 5.5 Apply DISTINCT to final result set if specified
    let distinctRows = projectedRows;
    if (plan.distinct) {
        distinctRows = applyDistinct(projectedRows);
    }

    // 6. Order By
    let orderedRows = applyOrderBy(distinctRows, plan.orderBy);

    // 7. Limit
    if (plan.limit !== null && plan.limit !== undefined) {
        return orderedRows.slice(0, plan.limit);
    }
    
    return orderedRows;
}

async function executeUnionPlan(stack, plan, params) {
    if (plan.selectPlans.length === 0) return [];

    // Step 1: Execute all SELECT sub-queries to get their result sets.
    // This can be done in parallel for efficiency.
    const allSelectResults = await Promise.all(
        plan.selectPlans.map(p => executeSingleSelectPlan(stack, p, params))
    );

    // Step 2: Combine the results sequentially based on the UNION operations.
    // UNION is left-associative, e.g., (A UNION B) UNION C.
    // We start with the results of the very first SELECT statement, which corresponds to the
    // first `top` plan in the chain.
    let combinedRows = allSelectResults[plan.unionOps[0].topPlanIndex];

    // The unionOps are ordered. Each one connects the result of the previous operation
    // with the next SELECT statement's results.
    for (const unionOp of plan.unionOps) {
        // The `bottomPlanIndex` tells us which result set to merge next.
        const nextRows = allSelectResults[unionOp.bottomPlanIndex];
        
        combinedRows.push(...nextRows);
        
        if (unionOp.distinct) {
            combinedRows = applyDistinct(combinedRows);
        }
    }

    // Step 3: Apply final ORDER BY and LIMIT to the fully combined result set.
    let orderedRows = applyOrderBy(combinedRows, plan.orderBy);
    if (plan.limit !== null && plan.limit !== undefined) {
        return orderedRows.slice(0, plan.limit);
    }
    return orderedRows;
}


/**
 * Executes a query plan against the in-memory database.
 * This function orchestrates fetching data, joining, filtering, aggregating,
 * projecting, sorting, and limiting the results.
 * @param {object} stack The ClientStack instance providing data access.
 * @param {object} plan The query plan generated by the planner.
 * @param {Array<any>} params A list of parameters for prepared statements (not used in this version).
 * @param {object | null} outerRow The data row from an outer query for correlated subqueries.
 * @param {object | null} outerAliases The aliases from an outer query.
 * @returns {Promise<Array<object>>} A promise that resolves to the final query results.
 * @throws {Error} If a table specified in the query is not found.
 */
export async function executePlan(stack: ClientStack, plan, params, outerRow = null, outerAliases = null) {
    if (!plan) return [];
    
    if (plan.type === 'union') {
        return executeUnionPlan(stack, plan, params);
    }
    
    // Default to existing logic for single select plan
    return executeSingleSelectPlan(stack, plan, params, outerRow, outerAliases);
}