/**
 * Creates an array of accumulator instances based on the aggregate functions in the query plan.
 * @param {Array<object>} aggregates A list of aggregate function definitions from the plan.
 * @param {string} fromAlias The alias for the FROM table.
 * @param {object} joinAliases A map of join aliases.
 * @returns {Array<object>} An array of initialized accumulator instances.
 * @throws {Error} If an unsupported aggregate function is specified.
 */
export declare function createAccumulators(aggregates: any, fromAlias: any, joinAliases: any): any;
