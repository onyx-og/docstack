// @ts-nocheck
import { evalExpression } from './evaluator';

/**
 * Accumulator for the SUM() aggregate function.
 */
class Sum {
    /**
     * @param {string} alias The result alias for this aggregate.
     * @param {object} expr The expression to be summed.
     * @param {string} fromAlias The alias of the FROM table.
     * @param {object} joinAliases A map of join table aliases.
     */
    constructor(alias, expr, fromAlias, joinAliases) {
        this.alias = alias;
        this.expr = expr;
        this.fromAlias = fromAlias;
        this.joinAliases = joinAliases;
        this.sum = 0;
        this.seen = false;
    }
    /**
     * Adds a row's value to the sum.
     * @param {object} row The row to process.
     */
    async add(row) {
        const val = await evalExpression(row, this.expr, this.fromAlias, this.joinAliases);
        if (val != null && typeof val === 'number') {
            this.sum += val;
            this.seen = true;
        }
    }
    /**
     * Returns the final sum.
     * @returns {number|null} The total sum, or null if no values were added.
     */
    result() { return this.seen ? this.sum : null; }
}

/**
 * Accumulator for the COUNT() aggregate function.
 */
class Count {
     /**
     * @param {string} alias The result alias for this aggregate.
     * @param {object} expr The expression to be counted.
     * @param {string} fromAlias The alias of the FROM table.
     * @param {object} joinAliases A map of join table aliases.
     */
    constructor(alias, expr, fromAlias, joinAliases) {
        this.alias = alias;
        this.expr = expr;
        this.fromAlias = fromAlias;
        this.joinAliases = joinAliases;
        this.count = 0;
    }
    /**
     * Increments the count for a row. For COUNT(column), it only counts non-null values.
     * For COUNT(*), it counts all rows.
     * @param {object} row The row to process.
     */
    async add(row) {
        if (this.expr.type === 'star') {
             this.count++;
        } else {
            const val = await evalExpression(row, this.expr, this.fromAlias, this.joinAliases);
            if (val != null) {
                this.count++;
            }
        }
    }
    /**
     * Returns the final count.
     * @returns {number} The total count.
     */
    result() { return this.count; }
}

/**
 * Accumulator for the AVG() aggregate function.
 */
class Avg {
    /**
     * @param {string} alias The result alias for this aggregate.
     * @param {object} expr The expression to be averaged.
     * @param {string} fromAlias The alias of the FROM table.
     * @param {object} joinAliases A map of join table aliases.
     */
    constructor(alias, expr, fromAlias, joinAliases) {
        this.alias = alias;
        this.expr = expr;
        this.fromAlias = fromAlias;
        this.joinAliases = joinAliases;
        this.sum = 0;
        this.count = 0;
    }
    /**
     * Adds a row's value to the running sum and increments the count.
     * @param {object} row The row to process.
     */
    async add(row) {
        const val = await evalExpression(row, this.expr, this.fromAlias, this.joinAliases);
        if (val != null && typeof val === 'number') {
            this.sum += val;
            this.count++;
        }
    }
    /**
     * Returns the final average.
     * @returns {number|null} The average, or null if no values were added.
     */
    result() { return this.count > 0 ? this.sum / this.count : null; }
}

/**
 * Accumulator for the MIN() aggregate function.
 */
class Min {
    /**
     * @param {string} alias The result alias for this aggregate.
     * @param {object} expr The expression to find the minimum of.
     * @param {string} fromAlias The alias of the FROM table.
     * @param {object} joinAliases A map of join table aliases.
     */
    constructor(alias, expr, fromAlias, joinAliases) {
        this.alias = alias;
        this.expr = expr;
        this.fromAlias = fromAlias;
        this.joinAliases = joinAliases;
        this.min = null;
    }
    /**
     * Updates the minimum value based on the current row.
     * @param {object} row The row to process.
     */
    async add(row) {
        const val = await evalExpression(row, this.expr, this.fromAlias, this.joinAliases);
        if (val != null) {
            if (this.min === null || val < this.min) {
                this.min = val;
            }
        }
    }
    /**
     * Returns the final minimum value.
     * @returns {*} The minimum value, or null if no values were processed.
     */
    result() { return this.min; }
}

/**
 * Accumulator for the MAX() aggregate function.
 */
class Max {
    /**
     * @param {string} alias The result alias for this aggregate.
     * @param {object} expr The expression to find the maximum of.
     * @param {string} fromAlias The alias of the FROM table.
     * @param {object} joinAliases A map of join table aliases.
     */
    constructor(alias, expr, fromAlias, joinAliases) {
        this.alias = alias;
        this.expr = expr;
        this.fromAlias = fromAlias;
        this.joinAliases = joinAliases;
        this.max = null;
    }
    /**
     * Updates the maximum value based on the current row.
     * @param {object} row The row to process.
     */
    async add(row) {
        const val = await evalExpression(row, this.expr, this.fromAlias, this.joinAliases);
        if (val != null) {
            if (this.max === null || val > this.max) {
                this.max = val;
            }
        }
    }
    /**
     * Returns the final maximum value.
     * @returns {*} The maximum value, or null if no values were processed.
     */
    result() { return this.max; }
}

/**
 * A wrapper class that adds DISTINCT functionality to another accumulator.
 * It ensures that the inner accumulator only processes unique values.
 */
class DistinctWrapper {
    /**
     * @param {object} innerAccumulator The accumulator to wrap (e.g., Count, Sum).
     */
    constructor(innerAccumulator) {
        this.inner = innerAccumulator;
        this.seen = new Set();
        this.alias = this.inner.alias;
    }

    /**
     * Adds a row's value to the inner accumulator only if it hasn't been seen before.
     * @param {object} row The row to process.
     */
    async add(row) {
        const val = await evalExpression(row, this.inner.expr, this.inner.fromAlias, this.inner.joinAliases);
        const key = JSON.stringify(val); // Use JSON to handle objects/arrays as keys

        if (!this.seen.has(key)) {
            this.seen.add(key);
            // Delegate to the inner accumulator, which will re-evaluate, but only for unique values
            await this.inner.add(row);
        }
    }

    /**
     * Returns the result from the inner accumulator.
     * @returns {*} The final aggregated result.
     */
    result() {
        return this.inner.result();
    }
}


/**
 * Creates an array of accumulator instances based on the aggregate functions in the query plan.
 * @param {Array<object>} aggregates A list of aggregate function definitions from the plan.
 * @param {string} fromAlias The alias for the FROM table.
 * @param {object} joinAliases A map of join aliases.
 * @returns {Array<object>} An array of initialized accumulator instances.
 * @throws {Error} If an unsupported aggregate function is specified.
 */
export function createAccumulators(aggregates, fromAlias, joinAliases) {
    return aggregates.map(agg => {
        const alias = agg.as || agg.expr.name;
        const expr = agg.expr.args.expr;
        const isDistinct = agg.expr.args.distinct;

        let accumulator;

        switch(agg.expr.name) {
            case 'COUNT':
                accumulator = new Count(alias, expr, fromAlias, joinAliases);
                break;
            case 'SUM':
                accumulator = new Sum(alias, expr, fromAlias, joinAliases);
                break;
            case 'AVG':
                accumulator = new Avg(alias, expr, fromAlias, joinAliases);
                break;
            case 'MIN':
                accumulator = new Min(alias, expr, fromAlias, joinAliases);
                break;
            case 'MAX':
                accumulator = new Max(alias, expr, fromAlias, joinAliases);
                break;
            default:
                throw new Error(`Unsupported aggregate function: ${agg.expr.name}`);
        }

        if (isDistinct) {
            // COUNT(*) should not be distinct
            if (expr.type === 'star') return accumulator;
            return new DistinctWrapper(accumulator);
        }
        
        return accumulator;
    });
}