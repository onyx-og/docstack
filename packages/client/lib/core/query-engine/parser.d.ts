import { SelectAST, UnionAST } from "@docstack/shared";
/**
 * Parses a SQL SELECT statement into an Abstract Syntax Tree (AST).
 * This parser uses a scanner and a sequence of clause handlers to build the AST
 * in a structured and extensible way. It supports UNION and UNION ALL.
 * @param {string} sql The SQL query string to parse.
 * @returns {(SelectAST | UnionAST)[]} List of ASTs representing the query.
 * @throws {Error} If the SQL syntax is invalid or contains unexpected tokens.
 */
export declare function parse(sql: string): (SelectAST | UnionAST)[];
