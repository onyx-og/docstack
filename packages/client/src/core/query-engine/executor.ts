// @ts-nocheck
import { evalExpression, createRowEvaluator, evalAggregatedRowExpression } from './evaluator.js';
import { createAccumulators } from './accumulators.js';
import { isPushablePredicate, isPushableColumnName } from './planner.js';
import ClientStack from '../stack.js';

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
const MANGO_OPS = {
    '=': '$eq',
    '>': '$gt',
    '<': '$lt',
    '>=': '$gte',
    '<=': '$lte',
};

/**
 * Converts pushable predicates into a flat Mango selector: one operator map per column
 * ({value: {$gte: 20, $lte: 40}}).
 *
 * Deliberately never emits `$and`: pouchdb-find was observed returning documents
 * outside the class filter when a top-level `$and` was combined with top-level field
 * selectors, so only the canonical flat form is used. Selector output is a *prefilter*
 * - the executor re-checks every predicate in memory on the fetched rows - so a
 * predicate this function cannot express (an operator collision on one column, an
 * unpushable shape) is simply left out and still enforced.
 */
function buildSelector(predicates) {
    if (!predicates || predicates.length === 0) return {};
    const selector = {};
    for (const pred of predicates) {
        if (!isPushablePredicate(pred)) continue;
        const key = pred.left.column;
        const op = MANGO_OPS[pred.operator];
        const existing = selector[key];
        if (existing && op in existing) continue; // same op twice on one column: the in-memory check keeps the stricter
        selector[key] = { ...(existing || {}), [op]: pred.right.value };
    }
    return selector;
}

/**
 * Merges two flat Mango selectors as a conjunction. On a per-column clash the first
 * selector's operators win; the dropped ones are still enforced by the in-memory
 * re-check.
 */
function combineSelectors(a, b) {
    const merged = { ...(b || {}) };
    for (const [key, ops] of Object.entries(a || {})) {
        merged[key] = key in merged ? { ...merged[key], ...ops } : ops;
    }
    return merged;
}

/** Flattens a predicate tree of `and` nodes into a list of leaf predicates. */
function flattenAnd(predicate, out = []) {
    if (!predicate) return out;
    if (predicate.type === 'and') {
        flattenAnd(predicate.left, out);
        flattenAnd(predicate.right, out);
        return out;
    }
    out.push(predicate);
    return out;
}

/**
 * Collects the plain column names an expression reads. Returns false when the
 * expression contains anything that makes a field projection unsafe - a star, a
 * scalar subquery (whose correlation may read arbitrary columns), or a column name
 * Mango cannot be handed.
 */
function collectPushableColumns(expr, out) {
    if (!expr) return true;
    switch (expr.type) {
        case 'column_ref':
            if (!isPushableColumnName(expr.column)) return false;
            out.add(expr.column);
            return true;
        case 'param':
        case 'literal':
            return true;
        case 'binary_expr':
        case 'and':
            return collectPushableColumns(expr.left, out) && collectPushableColumns(expr.right, out);
        case 'aggr_func': {
            const arg = expr.args && expr.args.expr;
            if (!arg || arg.type === 'star') return true;
            return collectPushableColumns(arg, out);
        }
        default:
            return false;
    }
}

/**
 * Field list to push into the fetch for a single-table plan, or null when the plan
 * reads anything a projection could hide. System fields ride along: the read path
 * needs `~class` (class resolution, decryption) and `active`, and rows need identity.
 */
function computeProjectionFields(plan) {
    if (plan.joins.length > 0) return null;
    const cols = new Set();
    const exprs = [];
    if (plan.aggregation) {
        exprs.push(...(plan.aggregation.groupBy || []));
        for (const agg of (plan.aggregation.aggregates || [])) exprs.push(agg.expr);
        if (plan.aggregation.having) exprs.push(plan.aggregation.having);
    } else {
        for (const p of plan.projections) exprs.push(p.expr);
    }
    exprs.push(...plan.filters.left, ...plan.filters.residual);
    if (Array.isArray(plan.orderBy)) for (const o of plan.orderBy) exprs.push(o.expr);
    if (Array.isArray(plan.distinctOn)) exprs.push(...plan.distinctOn);

    for (const expr of exprs) {
        if (!collectPushableColumns(expr, cols)) return null;
    }
    return [...cols, "_id", "_rev", "~class", "active"];
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
function applyDistinct(rows, columns = null) {
    if (!rows || rows.length === 0) return [];

    const seen = new Set();
    const result = [];

    for (const row of rows) {
        // Create a stable key based on the row's values.
        // Sorting keys ensures that {a:1, b:2} and {b:2, a:1} are treated as the same.
        const key = JSON.stringify(
            columns && columns.length > 0
                ? columns.map(col => row[col])
                : Object.keys(row).sort().map(k => row[k])
        );
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
    const fromAlias0 = plan.fromTable.as || plan.fromTable.table;
    const singleTable = plan.joins.length === 0;

    // Nothing after the fetch reshapes the row set: no joins, no in-memory filters,
    // no aggregation or DISTINCT. Required for LIMIT to ride the query.
    const noReshape = singleTable && plan.filters.residual.length === 0
        && !plan.aggregation && !plan.distinct;

    // Per-document policy filtering and locked-crypto hiding both drop rows *after*
    // the fetch, which would under-fill a pushed LIMIT and starve a projection of the
    // columns a policy rule reads. One gate covers both pushdowns.
    const safeEarly = singleTable && await stack.canApplyQueryLimitEarly(plan.fromTable.table);

    // ORDER BY pushdown candidate: exactly one plain column of the from-table.
    // Multi-column sorts stay in memory - each combination would need its own
    // compound index, and the standing write cost of an index is only paid where it
    // buys top-K fetching.
    let sortField = null, sortDir = 'asc';
    if (Array.isArray(plan.orderBy) && plan.orderBy.length === 1) {
        const o = plan.orderBy[0];
        const col = o && o.expr && o.expr.column;
        const tbl = o && o.expr && o.expr.table;
        if (col && isPushableColumnName(col) && (!tbl || tbl === fromAlias0)) {
            sortField = col;
            sortDir = o.order === 'DESC' ? 'desc' : 'asc';
        }
    }

    const hasOrder = Array.isArray(plan.orderBy) && plan.orderBy.length > 0;
    const wantLimit = plan.limit !== null && plan.limit !== undefined;
    const wantOffset = plan.offset !== null && plan.offset !== undefined && plan.offset > 0;

    // The LIMIT/OFFSET window pushes when the row set is final at fetch time - and
    // when an ORDER BY exists it must push too (through a sort index), or the window
    // keeps the wrong rows. The index is created on demand; ensureSortIndex caps how
    // many may exist and refuses past the cap, which simply keeps this query in
    // memory.
    let pushSort = false;
    let canPushWindow = (wantLimit || wantOffset) && noReshape && safeEarly && (!hasOrder || !!sortField);
    if (canPushWindow && hasOrder) {
        pushSort = await stack.ensureSortIndex(sortField);
        if (!pushSort) canPushWindow = false;
    }

    // Projection pushdown: fetch only the columns the plan reads. Caveat carried on
    // purpose: a Mango sort index only lists documents that HAVE the sort field, and
    // a projection only carries fields a document has - schema stamping keeps class
    // documents complete, so both hold for classed data.
    const projectionFields = safeEarly ? computeProjectionFields(plan) : null;

    let sortParam;
    let fetchSelector = leftSelector;
    if (pushSort) {
        sortParam = [{ "~class": sortDir }, { [sortField]: sortDir }];
        // Mango requires every sorted field constrained in the selector; $gte null
        // matches all values (null collates lowest).
        if (!(sortField in fetchSelector)) fetchSelector = { ...fetchSelector, [sortField]: { $gte: null } };
    }

    let windowPushed = canPushWindow;
    let fetched;
    try {
        fetched = await fromClass.getCards(
            fetchSelector,
            projectionFields || undefined,
            canPushWindow && wantOffset ? plan.offset : undefined,
            canPushWindow ? (plan.limit ?? undefined) : undefined,
            sortParam
        );
    } catch (error) {
        if (!sortParam) throw error;
        // A sorted fetch can fail when the index isn't usable (deleted underneath us,
        // adapter quirk). The query is still answerable - fetch plain, sort in memory.
        windowPushed = false;
        fetched = await fromClass.getCards(leftSelector, projectionFields || undefined);
    }
    let leftRows = fetched.map(row => ({ [fromAlias0]: row }));

    // 2. Execute Joins
    let currentResultRows = leftRows;
    for (const join of plan.joins) {
        const rightClass = await stack.getClass(join.table);
        if (!rightClass) throw new Error(`Table not found: ${join.table}`);
        
        const joinAlias = join.as || join.table;
        const fromAlias = plan.fromTable.as || plan.fromTable.table;

        // Combine base table filters with filters from the subquery's WHERE clause.
        // The selector is only a prefilter: every predicate - pushed or not - is also
        // evaluated on the fetched rows, so nothing depends on Mango expressing it
        // (the previous version silently dropped what buildSelector couldn't say).
        const rightPredicates = plan.filters.right[join.table] || [];
        const joinFilterLeaves = (join.filters || []).flatMap(f => flattenAnd(f));
        let finalRightSelector = combineSelectors(
            buildSelector(rightPredicates),
            buildSelector(joinFilterLeaves.filter(isPushablePredicate))
        );

        // Identify which side of ON references the joined table, by alias.
        const refsJoin = (expr) => expr && expr.type === 'column_ref' && expr.table === joinAlias;
        let rightKeyExpr = null, leftKeyExpr = null;
        if (join.on && join.on.type === 'binary_expr') {
            if (refsJoin(join.on.left) && !refsJoin(join.on.right)) { rightKeyExpr = join.on.left; leftKeyExpr = join.on.right; }
            else if (refsJoin(join.on.right) && !refsJoin(join.on.left)) { rightKeyExpr = join.on.right; leftKeyExpr = join.on.left; }
        }

        // Semi-join narrowing: only right rows whose join key occurs among the left
        // rows' keys can ever match, so those keys ride the fetch as an $in - unless
        // there are too many (the selector would outweigh the fetch) or the join is a
        // RIGHT join, whose unmatched right rows must all surface. Safe for SEMI and
        // ANTI too: membership is only ever probed with left-side keys.
        const KEY_PUSH_CAP = 500;
        let skipRightFetch = false;
        if (join.type !== 'RIGHT' && rightKeyExpr && leftKeyExpr
            && isPushableColumnName(rightKeyExpr.column)
            && (join.on.operator === '=' || (join.on.operator === 'IN' && rightKeyExpr === join.on.left))) {
            const keys = new Set();
            let collectable = true;
            for (const leftRow of currentResultRows) {
                const v = await evalExpression(leftRow, leftKeyExpr, fromAlias, {}, stack, executePlan, leftRow);
                const vals = join.on.operator === 'IN' ? (Array.isArray(v) ? v : []) : [v];
                for (const k of vals) {
                    if (k === null || k === undefined) continue;
                    if (typeof k === 'object') { collectable = false; break; }
                    keys.add(k);
                }
                if (!collectable || keys.size > KEY_PUSH_CAP) { collectable = false; break; }
            }
            if (collectable) {
                if (keys.size === 0) skipRightFetch = true;
                else finalRightSelector = combineSelectors(finalRightSelector, { [rightKeyExpr.column]: { $in: [...keys] } });
            }
        }

        let allRightRows = skipRightFetch ? [] : await rightClass.getCards(finalRightSelector);
        const rightChecks = [...rightPredicates, ...joinFilterLeaves];
        if (rightChecks.length > 0) {
            const joinAlias_ = join.as || join.table;
            const evaluators = rightChecks.map(predicate => createRowEvaluator(predicate, stack, executePlan, outerRow, null));
            allRightRows = await asyncFilter(allRightRows, async (rightRow) => {
                const wrapped = { [joinAlias_]: rightRow };
                for (const evaluator of evaluators) {
                    if (!(await evaluator(wrapped))) return false;
                }
                return true;
            });
        }
        
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

        // Equi-joins (`ON u._id = t.assigneeId`) hash the right rows by their join key.
        // Before this existed only the `ON a._id IN m.actors` array pattern matched -
        // a plain equality join silently produced no rows. NULL keys are skipped on
        // both sides: in SQL, NULL never equals anything.
        let rightRowsByKey = null;
        if (join.on && join.on.operator === '=' && rightKeyExpr && leftKeyExpr) {
            rightRowsByKey = new Map();
            for (const rightRow of allRightRows) {
                const key = await evalExpression({ [joinAlias]: rightRow }, rightKeyExpr, joinAlias, {}, stack, executePlan, null);
                if (key === null || key === undefined) continue;
                const bucket = rightRowsByKey.get(key);
                if (bucket) bucket.push(rightRow); else rightRowsByKey.set(key, [rightRow]);
            }
        }

        let newResultRows = [];
        const matchedRightIds = new Set();

        for(const leftRow of currentResultRows) {
            let matchFoundForLeftRow = false;

            if (join.on.operator === 'IN') {
                // The `ON a._id IN m.actors` pattern: the left row carries an array of
                // right-side ids.
                const fk_list = await evalExpression(leftRow, join.on.right, fromAlias, {}, stack, executePlan, leftRow);
                if (Array.isArray(fk_list)) {
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
            } else if (rightRowsByKey) {
                const key = await evalExpression(leftRow, leftKeyExpr, fromAlias, {}, stack, executePlan, leftRow);
                if (key !== null && key !== undefined) {
                    for (const rightRow of rightRowsByKey.get(key) || []) {
                        newResultRows.push({ ...leftRow, [joinAlias]: rightRow });
                        matchFoundForLeftRow = true;
                        if (join.type === 'RIGHT') {
                            matchedRightIds.add(rightRow._id);
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
    
    // 3. Apply residual filters - and re-check the pushed-down ones. The selector is
    // treated as a prefilter only: evaluating every WHERE predicate here keeps results
    // correct even where pouchdb-find's selector matching misbehaves (observed with
    // $and), at the cost of a comparison per row over rows already in memory.
    let filteredRows = joinedRows;
    const whereChecks = [...plan.filters.left, ...plan.filters.residual];
    if (whereChecks.length > 0) {
        const evaluators = whereChecks.map(predicate => createRowEvaluator(predicate, stack, executePlan, outerRow, null));
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
    
    // 5.4 Resolve ORDER BY keys against the *pre-projection* rows. SQL lets ORDER BY
    // name a column the SELECT list dropped (`SELECT b.name ... ORDER BY b.value`);
    // sorting the projected rows alone silently kept fetch order for those. Keys that
    // resolve to nothing here (a SELECT-list alias like `actor_name`) fall back to the
    // projected row's own value during the sort.
    let rawSortKeys = null;
    if (!plan.aggregation && Array.isArray(plan.orderBy) && plan.orderBy.length > 0) {
        const fromAlias_ = plan.fromTable.as || plan.fromTable.table;
        const joinAliases_ = plan.joins.reduce((acc, j) => ({ ...acc, [j.as || j.table]: j.table }), {});
        rawSortKeys = await Promise.all(finalRows.map(row =>
            Promise.all(plan.orderBy.map(o => evalExpression(row, o.expr, fromAlias_, joinAliases_, stack, executePlan, row)))
        ));
    }

    const sortPairs = (pairs) => {
        if (!Array.isArray(plan.orderBy) || plan.orderBy.length === 0) return pairs;
        return [...pairs].sort((a, b) => {
            for (let j = 0; j < plan.orderBy.length; j++) {
                const order = plan.orderBy[j];
                const key = order.expr.column;
                const valA = a.keys && a.keys[j] !== null && a.keys[j] !== undefined ? a.keys[j] : a.row[key];
                const valB = b.keys && b.keys[j] !== null && b.keys[j] !== undefined ? b.keys[j] : b.row[key];
                let comparison = 0;
                if (valA < valB) comparison = -1;
                if (valA > valB) comparison = 1;
                if (comparison !== 0) {
                    return order.order === 'DESC' ? -comparison : comparison;
                }
            }
            return 0;
        });
    };

    const distinctPairs = (pairs, columns) => {
        const seen = new Set();
        const result = [];
        for (const pair of pairs) {
            const key = JSON.stringify(
                columns && columns.length > 0
                    ? columns.map(col => pair.row[col])
                    : Object.keys(pair.row).sort().map(k => pair.row[k])
            );
            if (!seen.has(key)) {
                seen.add(key);
                result.push(pair);
            }
        }
        return result;
    };

    // 5.5 Apply DISTINCT/DISTINCT ON and ORDER BY
    let pairs = projectedRows.map((row, i) => ({ row, keys: rawSortKeys ? rawSortKeys[i] : null }));
    if (plan.distinct && plan.distinctOn) {
        const distinctColumns = plan.distinctOn.map(expr => expr.column);
        pairs = sortPairs(pairs);
        pairs = distinctPairs(pairs, distinctColumns);
    } else {
        if (plan.distinct) {
            pairs = distinctPairs(pairs, null);
        }
        pairs = sortPairs(pairs);
    }
    const orderedRows = pairs.map(pair => pair.row);

    // 7. OFFSET + LIMIT window. When the window already rode the fetch (skip/limit
    // pushed), applying the offset again here would drop rows twice.
    const start = windowPushed ? 0 : (plan.offset ?? 0);
    const end = (plan.limit !== null && plan.limit !== undefined) ? start + plan.limit : undefined;
    if (start > 0 || end !== undefined) {
        return orderedRows.slice(start, end);
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

    // Step 3: Apply final ORDER BY and the OFFSET/LIMIT window to the combined set.
    let orderedRows = applyOrderBy(combinedRows, plan.orderBy);
    const start = plan.offset ?? 0;
    const end = (plan.limit !== null && plan.limit !== undefined) ? start + plan.limit : undefined;
    if (start > 0 || end !== undefined) {
        return orderedRows.slice(start, end);
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

/** True when any node of a predicate/expression tree is a subquery. */
function containsSubquery(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'scalar_subquery' || node.type === 'subquery' || node.type === 'exists_expr') return true;
    return Object.values(node).some(value => typeof value === 'object' && containsSubquery(value));
}

/**
 * Executes a plan as an async stream of rows.
 *
 * A single-table plan with no aggregation, DISTINCT, ORDER BY, or subqueries streams
 * for real: rows ride `findDocumentsIterator`'s keyset pages, get the WHERE re-check
 * and projection per row, and honor OFFSET/LIMIT by counting - peak memory is one
 * batch regardless of result size, and a LIMIT stops the underlying scan early. Any
 * other plan falls back to `executePlan` and yields from the materialized result, so
 * the API is uniform even where streaming isn't.
 */
export async function* executePlanStream(stack: ClientStack, plan, params) {
    if (!plan) return;

    const streamable = plan.type === 'select'
        && plan.joins.length === 0
        && !plan.aggregation
        && !plan.distinct
        && (!plan.orderBy || plan.orderBy.length === 0)
        && (plan.projections.every(p => p.expr && p.expr.type === 'column_ref')
            || (plan.projections.length === 1 && plan.projections[0].expr && plan.projections[0].expr.type === 'star'))
        && !plan.filters.residual.some(containsSubquery)
        && !plan.projections.some(p => containsSubquery(p.expr));

    if (!streamable) {
        const rows = await executePlan(stack, plan, params);
        for (const row of rows) yield row;
        return;
    }

    const fromClass = await stack.getClass(plan.fromTable.table);
    if (!fromClass) throw new Error(`Table not found: ${plan.fromTable.table}`);
    const fromAlias = plan.fromTable.as || plan.fromTable.table;

    const safeEarly = await stack.canApplyQueryLimitEarly(plan.fromTable.table);
    const projectionFields = safeEarly ? computeProjectionFields(plan) : null;

    const selector = {
        ...buildSelector(plan.filters.left),
        "~class": { $eq: fromClass.getName() },
    };

    const whereChecks = [...plan.filters.left, ...plan.filters.residual];
    const evaluators = whereChecks.map(predicate => createRowEvaluator(predicate, stack, executePlan, null, null));

    const isStar = plan.projections.length === 1 && plan.projections[0].expr.type === 'star';
    const offset = plan.offset ?? 0;
    const limit = plan.limit ?? null;
    let skipped = 0;
    let emitted = 0;

    for await (const doc of stack.findDocumentsIterator(selector, { fields: projectionFields || undefined })) {
        const row = { [fromAlias]: doc };
        let matches = true;
        for (const evaluator of evaluators) {
            if (!(await evaluator(row))) { matches = false; break; }
        }
        if (!matches) continue;
        if (skipped < offset) { skipped++; continue; }

        if (isStar) {
            yield { ...doc };
        } else {
            const projected = {};
            for (const p of plan.projections) {
                const alias = p.as || p.expr.column;
                projected[alias] = await evalExpression(row, p.expr, fromAlias, {}, stack, executePlan, row);
            }
            yield projected;
        }

        emitted++;
        if (limit !== null && emitted >= limit) return;
    }
}