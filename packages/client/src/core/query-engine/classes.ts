import type { SelectAST, UnionAST } from "@docstack/shared";

/**
 * Working out which classes a query reads.
 *
 * Lives beside the parser that produces the AST, not in the consumer that walks it. The
 * `from` and `joins` fields are typed `any[]`, so a walk written anywhere else is a walk
 * over a structure it does not own - and the first time this engine grows a node shape
 * that walk does not recognise, it under-subscribes. Under-subscribing is silent: a live
 * view simply stops updating, which is the bug the subscription exists to fix. See
 * ADR-0025.
 *
 * @module
 */

/** A source in `from` or `joins`, as the parser emits it: `{ table, as }`. */
type QuerySource = { table?: unknown };

/**
 * Collects the class names a parsed query reads.
 *
 * Deliberately generic: rather than enumerating the node types that can hold a nested
 * query - `scalar_subquery`, `exists_expr`, the right-hand side of `IN` - it walks the
 * whole graph and harvests every `select` node it finds. A new subquery form is then
 * covered on the day it is added, rather than on the day someone notices a stale list.
 *
 * @param ast - The `ast` from {@link ClientStack.query}.
 * @returns The class names read, or `null` when the query reads a source that is not a
 * named class. That distinction is the contract: `[]` means *this query reads nothing* -
 * `SELECT 1` - and it is safe to subscribe to nothing; `null` means *I cannot account for
 * this*, and the caller should fail open rather than watch an incomplete set.
 *
 * @example
 * ```typescript
 * const { rows, ast } = await stack.query("SELECT * FROM Task JOIN Project ON …");
 * collectQueryClasses(ast);         // ["Task", "Project"]
 * collectQueryClasses([]);          // []   - reads nothing
 * collectQueryClasses(null);        // null - unknown, fail open
 * ```
 */
export const collectQueryClasses = (
    ast: (SelectAST | UnionAST)[] | null | undefined
): string[] | null => {
    if (!Array.isArray(ast)) return null;

    const classes = new Set<string>();
    // A parsed AST should be acyclic, but a walk that assumes so is one malformed node
    // away from hanging the tab.
    const seen = new Set<object>();
    let accountedFor = true;

    const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (seen.has(node as object)) return;
        seen.add(node as object);

        if (Array.isArray(node)) {
            for (const entry of node) visit(entry);
            return;
        }

        const candidate = node as { type?: unknown; from?: unknown; joins?: unknown };
        if (candidate.type === "select") {
            const sources: QuerySource[] = [
                ...(Array.isArray(candidate.from) ? candidate.from : []),
                ...(Array.isArray(candidate.joins) ? candidate.joins : []),
            ];
            for (const source of sources) {
                if (source && typeof source.table === "string" && source.table.length) {
                    classes.add(source.table);
                } else {
                    // A source with no name: a subquery in `FROM`, or a shape this
                    // function has not been taught. Either way the set is incomplete, and
                    // saying so is more useful than a partial answer the caller cannot
                    // tell apart from a complete one.
                    accountedFor = false;
                }
            }
        }

        for (const value of Object.values(node as Record<string, unknown>)) visit(value);
    };

    for (const entry of ast) visit(entry);

    return accountedFor ? [...classes] : null;
};
