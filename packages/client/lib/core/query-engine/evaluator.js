// @ts-nocheck
/**
 * Creates a function that evaluates a predicate AST node against a row.
 * This is useful for filtering operations (e.g., in WHERE or JOIN ON clauses).
 * The returned function is async to handle subqueries.
 * @param {object} astNode The predicate AST node.
 * @param {object} stack The ClientStack instance.
 * @param {function} executePlan The main query execution function.
 * @param {object} outerRow The row from the parent query context.
 * @param {object} outerAliases The aliases from the parent query context.
 * @returns {function(object): Promise<boolean>} An async function that takes a row and returns true if it matches the predicate.
 */
export function createRowEvaluator(astNode, stack, executePlan, outerRow, outerAliases) {
    console.log("Got astNode", { astNode });
    return async (row) => {
        // Determine aliases from the current row context
        const fromAlias = Object.keys(row).find(k => row[k] !== null) || Object.keys(row)[0];
        const joinAliases = Object.keys(row).reduce((acc, key) => {
            if (key !== fromAlias)
                acc[key] = key; // simplified alias mapping
            return acc;
        }, {});
        // The row being evaluated is the inner context, and we pass the captured outer context.
        return await evalExpression(row, astNode, fromAlias, joinAliases, stack, executePlan, outerRow, outerAliases);
    };
}
/**
 * Evaluates an AST expression node against a data row. This function is async
 * to handle scalar subqueries which require executing a separate query plan.
 * @param {object} row The data row to evaluate against.
 * @param {object} expr The AST expression node.
 * @param {string} fromAlias The alias for the main FROM table.
 * @param {object} joinAliases A map of aliases for joined tables.
 * @param {object} stack The ClientStack instance for data access.
 * @param {function} executePlan The function to execute sub-plans.
 * @param {object} outerRow The row from the parent query context (for correlation).
 * @param {object} outerAliases The aliases from the parent query context.
 * @returns {Promise<*>} The result of the expression evaluation.
 */
export async function evalExpression(row, expr, fromAlias, joinAliases, stack, executePlan, outerRow, outerAliases) {
    if (!expr)
        return null;
    switch (expr.type) {
        case 'scalar_subquery': {
            // Dynamically import planner to avoid circular dependency
            const { createPlan } = await import('./planner.js');
            console.log({ expr });
            const subqueryPlan = createPlan([expr.ast]);
            // Execute the subquery, passing the current row as the outer context for correlation
            const result = await executePlan(stack, subqueryPlan, [], row, null); // Pass outer row, but no aliases
            if (result.length > 0 && result[0] != null) {
                const firstRow = result[0];
                const firstColName = Object.keys(firstRow)[0];
                return firstRow[firstColName];
            }
            return null; // SQL standard: scalar subquery with no rows evaluates to NULL
        }
        case 'column_ref': {
            const tableAlias = expr.table || fromAlias;
            const tableData = row[tableAlias];
            // 1. Check current row's data for the specified alias
            if (tableData && typeof tableData === 'object' && tableData !== null && tableData.hasOwnProperty(expr.column)) {
                return tableData[expr.column];
            }
            // 2. Fallback for simplified structures (e.g., aggregated rows)
            if (row.hasOwnProperty(expr.column)) {
                return row[expr.column];
            }
            // 3. Check outer context for correlated subqueries
            if (outerRow) {
                for (const alias in outerRow) {
                    const outerTableData = outerRow[alias];
                    if (outerTableData && typeof outerTableData === 'object' && outerTableData.hasOwnProperty(expr.column)) {
                        // If an explicit table is specified in the expression (e.g., m.actors),
                        // it must match the alias in the outer row.
                        if (expr.table && expr.table !== alias) {
                            continue;
                        }
                        return outerTableData[expr.column];
                    }
                }
            }
            return null;
        }
        case 'binary_expr': {
            console.log("Evaluating binary expression", { left: expr.left, right: expr.right });
            const left = await evalExpression(row, expr.left, fromAlias, joinAliases, stack, executePlan, outerRow, outerAliases);
            let right;
            if (expr.right.type === 'param') {
                right = expr.right.value;
                if (!isNaN(parseFloat(right)))
                    right = parseFloat(right);
            }
            else {
                right = await evalExpression(row, expr.right, fromAlias, joinAliases, stack, executePlan, outerRow, outerAliases);
            }
            switch (expr.operator) {
                case '=': return left == right;
                case '>': return left > right;
                case '<': return left < right;
                case '>=': return left >= right;
                case '<=': return left <= right;
                case 'IN': // This is handled specially during join execution
                    return Array.isArray(right) && right.includes(left);
                default:
                    throw new Error(`Unsupported operator ${expr.operator}`);
            }
        }
        case 'aggr_func':
            // This should be handled by accumulators, but can be evaluated post-aggregation
            if (row.hasOwnProperty(expr.name))
                return row[expr.name];
            return null;
        case 'param':
            let value = expr.value;
            if (!isNaN(parseFloat(value)))
                value = parseFloat(value);
            return value;
        case 'star':
            return row; // Represents the whole row for COUNT(*)
        default:
            throw new Error(`Unsupported expression type: ${expr.type}`);
    }
}
/**
 * Evaluates an expression against a row that has already been aggregated.
 * This is specifically used for the HAVING clause, where expressions can
 * contain aggregate functions or GROUP BY columns.
 * @param {object} row The aggregated data row.
 * @param {object} expr The AST expression node from the HAVING clause.
 * @param {Map<string, string>} aggregateAliasMap A map to resolve aggregate function expressions to their aliases in the row.
 * @returns {*} The result of the expression evaluation.
 * @throws {Error} If the expression is invalid for a HAVING clause.
 */
export function evalAggregatedRowExpression(row, expr, aggregateAliasMap) {
    if (!expr)
        return null;
    switch (expr.type) {
        case 'aggr_func':
            const key = JSON.stringify(expr);
            const alias = aggregateAliasMap.get(key);
            if (alias && row.hasOwnProperty(alias)) {
                return row[alias];
            }
            throw new Error(`Aggregate function ${expr.name} used in HAVING clause was not found in the SELECT list.`);
        case 'column_ref':
            // In an aggregated row, column refs point to GROUP BY keys.
            const colName = expr.as || expr.column;
            if (row.hasOwnProperty(colName)) {
                return row[colName];
            }
            throw new Error(`Column '${colName}' not found in aggregated row. It must be part of the GROUP BY clause.`);
        case 'binary_expr':
            const left = evalAggregatedRowExpression(row, expr.left, aggregateAliasMap);
            let right;
            if (expr.right.type === 'param') {
                right = expr.right.value;
                if (!isNaN(parseFloat(right)))
                    right = parseFloat(right);
            }
            else {
                right = evalAggregatedRowExpression(row, expr.right, aggregateAliasMap);
            }
            switch (expr.operator) {
                case '=': return left == right;
                case '>': return left > right;
                case '<': return left < right;
                case '>=': return left >= right;
                case '<=': return left <= right;
                default:
                    throw new Error(`Unsupported operator in HAVING clause: ${expr.operator}`);
            }
        case 'param':
            let value = expr.value;
            if (!isNaN(parseFloat(value)))
                value = parseFloat(value);
            return value;
        default:
            throw new Error(`Unsupported expression type in HAVING clause: ${expr.type}`);
    }
}
//# sourceMappingURL=evaluator.js.map