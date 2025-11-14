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
export declare function createRowEvaluator(astNode: any, stack: any, executePlan: any, outerRow: any, outerAliases: any): (row: any) => Promise<any>;
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
export declare function evalExpression(row: any, expr: any, fromAlias: any, joinAliases: any, stack: any, executePlan: any, outerRow: any, outerAliases: any): any;
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
export declare function evalAggregatedRowExpression(row: any, expr: any, aggregateAliasMap: any): any;
