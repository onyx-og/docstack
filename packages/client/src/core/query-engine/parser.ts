
// @ts-nocheck
// A SQL parser built with a scanner and a registry of pluggable clause handlers.
// This approach is more robust and extensible than regex-based string splitting.

// ---------- Core AST types ----------
// These types match the existing AST structure expected by the planner.
import { SelectAST, UnionAST } from "@docstack/shared";

// ---------- Scanner (cursor) ----------
class Scanner {
  constructor(public text: string, public pos = 0) {}
  eof() { return this.pos >= this.text.length; }
  rest() { return this.text.slice(this.pos); }

  skipWSAndComments(): void {
    while (!this.eof()) {
      const char = this.peekChar();
      if (/\s/.test(char)) {
        this.pos++;
        continue;
      }
      if (char === '-' && this.peekChar(1) === '-') {
        while (!this.eof() && this.peekChar() !== '\n') this.pos++;
        continue;
      }
      break;
    }
  }

  peekChar(offset = 0): string {
    const i = this.pos + offset;
    return i < this.text.length ? this.text[i] : '';
  }

  peekKW(kw: string): boolean {
    this.skipWSAndComments();
    const len = kw.length;
    if (this.text.substr(this.pos, len).toUpperCase() !== kw.toUpperCase()) return false;
    const next = this.text[this.pos + len] || '';
    // Keyword boundary rule: next char must not be part of an identifier
    if (/[A-Za-z0-9_]/.test(next)) return false;
    return true;
  }

  tryKW(kw: string): boolean {
    if (!this.peekKW(kw)) return false;
    this.pos += kw.length;
    return true;
  }

  expectKW(kw: string, msg = `Expected '${kw}'`): void {
    if (!this.tryKW(kw)) throw new Error(msg + ` at position ${this.pos}`);
  }

  matchRe(re: RegExp): RegExpMatchArray | null {
    this.skipWSAndComments();
    const m = this.rest().match(re);
    if (!m || m.index !== 0) return null;
    return m;
  }

  consumeRe(re: RegExp, msg: string): RegExpMatchArray {
    const m = this.matchRe(re);
    if (!m) throw new Error(msg + ` at position ${this.pos}`);
    this.pos += m[0].length;
    return m;
  }
}

// ---------- Helper parsers ----------

function parseSimpleIdentifier(scan: Scanner): string {
    const match = scan.consumeRe(/^[a-zA-Z_][a-zA-Z0-9_]*/, 'Expected identifier');
    return match[0];
}

function parseColumnExpr(scan: Scanner) {
    scan.skipWSAndComments();
    const char = scan.peekChar();
    if (char === '*') {
        scan.pos++;
        return { type: 'star' };
    }
    if (char === '1') { // Hack for `SELECT 1` in EXISTS
        scan.pos++;
        return { type: 'literal', value: 1 };
    }

    const part1 = parseSimpleIdentifier(scan);
    scan.skipWSAndComments();
    if (scan.peekChar() === '.') {
        scan.pos++;
        const part2 = parseSimpleIdentifier(scan);
        return { type: 'column_ref', table: part1, column: part2 };
    }
    return { type: 'column_ref', table: null, column: part1 };
}

function parseExpression(scan: Scanner): any {
    scan.skipWSAndComments();
    const startPos = scan.pos;

    // Check for scalar subquery `(SELECT ...)`
    if (scan.peekChar() === '(') {
        const tempScan = new Scanner(scan.text, scan.pos + 1);
        if (tempScan.peekKW('SELECT')) {
            scan.consumeRe(/^\s*\(/, 'Expected (');
            const subqueryAst = parseSingleSelect(scan);
            scan.consumeRe(/^\s*\)/, 'Expected )');
            return { type: 'scalar_subquery', ast: subqueryAst };
        }
    }

    const identMatch = scan.matchRe(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identMatch) {
        const afterIdentPos = scan.pos + identMatch[0].length;
        const tempScanner = new Scanner(scan.text, afterIdentPos);
        tempScanner.skipWSAndComments();
        if (tempScanner.peekChar() === '(') {
            // Confirmed function call
            const name = identMatch[0].toUpperCase();
            scan.pos = afterIdentPos;
            scan.consumeRe(/^\s*\(/, 'Expected (');
            const distinct = scan.tryKW('DISTINCT');
            const argExpr = parseColumnExpr(scan);
            scan.consumeRe(/^\s*\)/, 'Expected )');
            return {
                type: 'aggr_func',
                name,
                args: { expr: argExpr, distinct }
            };
        }
    }
    
    scan.pos = startPos;
    return parseColumnExpr(scan);
}

function parsePredicate(scan: Scanner): any {
    scan.skipWSAndComments();

    let not = false;
    if (scan.tryKW('NOT')) {
        not = true;
    }

    if (scan.tryKW('EXISTS')) {
        scan.consumeRe(/^\s*\(/, 'Expected (');
        const subqueryAst = parseSingleSelect(scan);
        scan.consumeRe(/^\s*\)/, 'Expected )');
        return { type: 'exists_expr', subquery: subqueryAst, not };
    }
    
    if (not) {
        // "NOT" was consumed but it wasn't "NOT EXISTS". This could be "NOT IN" or a syntax error.
        // We put it back and let the binary expression parser handle it.
        scan.pos -= 3;
    }

    const left = parseExpression(scan);
    scan.skipWSAndComments();
    const opMatch = scan.matchRe(/^(>=|<=|>|<|=|IN|NOT\s+IN)/i);
    if (!opMatch) throw new Error(`Expected binary operator at position ${scan.pos}`);
    
    const operator = opMatch[0].trim().toUpperCase();
    scan.pos += opMatch[0].length;

    scan.skipWSAndComments();
    let right;
    if (operator === 'IN' || operator === 'NOT IN') {
         if (scan.peekChar() === '(') {
            scan.consumeRe(/^\s*\(/, 'Expected (');
            scan.skipWSAndComments();
            if(scan.peekKW('SELECT')) {
                right = { type: 'subquery', ast: parseSingleSelect(scan) };
            } else {
                 throw new Error('Value lists for IN are not supported. Use subquery or array column ref.');
            }
            scan.consumeRe(/^\s*\)/, 'Expected )');
         } else {
             // This handles the `a._id IN m.actors` case where actors is a column ref to an array
             right = parseColumnExpr(scan);
         }
    } else {
        const valMatch = scan.matchRe(/^[0-9]+(\.[0-9]+)?/);
        if (valMatch) {
            scan.pos += valMatch[0].length;
            right = { type: 'param', value: valMatch[0] };
        } else {
            // Handle right side being a column expression
            right = parseExpression(scan);
        }
    }

    // A real parser would build a proper expression tree for multiple AND/ORs.
    // For now, we assume a single predicate or predicates joined by AND, which we'll handle by pushing to a list.
    const predicate = { type: 'binary_expr', operator, left, right };
    
    if (scan.tryKW('AND')) {
        return { type: 'and', left: predicate, right: parsePredicate(scan) };
    }

    return predicate;
}

function parseSelectItem(scan: Scanner) {
    const expr = parseExpression(scan);
    let alias = null;
    if (scan.tryKW('AS')) {
        alias = parseSimpleIdentifier(scan);
    }
    return { expr, as: alias };
}

function parseSingleFrom(scan: Scanner) {
    const table = parseSimpleIdentifier(scan);
    scan.skipWSAndComments();
    let alias = null;

    if (scan.tryKW('AS')) {
        alias = parseSimpleIdentifier(scan);
    } else {
        const aliasMatch = scan.matchRe(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        if (aliasMatch) {
            const tempScanner = new Scanner(scan.text, scan.pos + aliasMatch[0].length);
            const isReservedWord = ['JOIN', 'WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'ON', 'AS'].some(kw => tempScanner.peekKW(kw));
            if (!isReservedWord) {
                scan.pos += aliasMatch[0].length;
                alias = aliasMatch[0];
            }
        }
    }
    return { table, as: alias || table };
}

function parseSingleSelect(scan: Scanner): SelectAST {
    const ast: SelectAST = {
        type: 'select', distinct: false, columns: [], from: [], joins: [],
        where: null, groupBy: null, having: null, orderBy: null, limit: null
    };

    const ctx = { scan, ast };
    
    if (!SelectHandler.canStart(ctx)) throw new Error('Expected SELECT in subquery');
    SelectHandler.parse(ctx);
    
    if (FromHandler.canStart(ctx)) FromHandler.parse(ctx);
    else throw new Error('Subquery must have a FROM clause.');

    while (JoinHandler.canStart(ctx)) JoinHandler.parse(ctx);
    if (WhereHandler.canStart(ctx)) WhereHandler.parse(ctx);
    if (GroupByHandler.canStart(ctx)) GroupByHandler.parse(ctx);
    if (HavingHandler.canStart(ctx)) HavingHandler.parse(ctx);
    if (OrderByHandler.canStart(ctx)) OrderByHandler.parse(ctx);
    if (LimitHandler.canStart(ctx)) LimitHandler.parse(ctx);

    return ast;
}


// ---------- Clause handler interface ----------
type ClauseCtx = { 
  scan: Scanner;
  ast: SelectAST;
  setAST?: (ast: SelectAST) => void;
  astList?: (SelectAST | UnionAST)[]
};
interface ClauseHandler {
  id: string;
  repeatable?: boolean;
  canStart(ctx: ClauseCtx): boolean;
  parse(ctx: ClauseCtx): void;
}

// ---------- Registry ----------
class ClauseRegistry {
  private handlers: ClauseHandler[] = [];
  register(h: ClauseHandler) { this.handlers.push(h); }
  get(id: string) { return this.handlers.find(h => h.id === id)!; }
}

// ---------- Concrete handlers ----------
const SelectHandler: ClauseHandler = {
  id: 'SELECT',
  canStart: ({ scan }) => scan.peekKW('SELECT'),
  parse: ({ scan, ast }) => {
    scan.expectKW('SELECT');
    if (scan.tryKW('DISTINCT')) ast.distinct = true;
    const cols: any[] = [];
    while (!scan.eof()) {
      scan.skipWSAndComments();
      if (scan.peekKW('FROM')) break;
      cols.push(parseSelectItem(scan));
      if (!scan.tryKW(',')) break;
    }
    ast.columns = cols;
  }
};

const FromHandler: ClauseHandler = {
  id: 'FROM',
  canStart: ({ scan }) => scan.peekKW('FROM'),
  parse: ({ scan, ast }) => {
    scan.expectKW('FROM');
    ast.from = [parseSingleFrom(scan)];
  }
};

const JoinHandler: ClauseHandler = {
  id: 'JOIN',
  repeatable: true,
  canStart: ({ scan }) => {
    const save = scan.pos;
    scan.skipWSAndComments();
    scan.tryKW('LEFT') || scan.tryKW('RIGHT') || scan.tryKW('INNER');
    const ok = scan.peekKW('JOIN');
    scan.pos = save;
    return ok;
  },
  parse: ({ scan, ast }) => {
    let joinType: 'LEFT' | 'INNER' | 'RIGHT' = 'INNER';
    if (scan.tryKW('LEFT')) joinType = 'LEFT';
    else if (scan.tryKW('RIGHT')) joinType = 'RIGHT';
    else scan.tryKW('INNER');
    scan.expectKW('JOIN');
    const fromPart = parseSingleFrom(scan);
    scan.expectKW('ON');
    const onCondition = parsePredicate(scan);
    ast.joins.push({ type: joinType, table: fromPart.table, as: fromPart.as, on: onCondition });
  }
};

const WhereHandler: ClauseHandler = {
  id: 'WHERE',
  canStart: ({ scan }) => scan.peekKW('WHERE'),
  parse: ({ scan, ast }) => {
    scan.expectKW('WHERE');
    ast.where = parsePredicate(scan);
  }
};

const GroupByHandler: ClauseHandler = {
  id: 'GROUP BY',
  canStart: ({ scan }) => scan.peekKW('GROUP'),
  parse: ({ scan, ast }) => {
    scan.expectKW('GROUP'); scan.expectKW('BY');
    const cols: any[] = [];
    while (true) {
      cols.push(parseColumnExpr(scan));
      if (!scan.tryKW(',')) break;
    }
    ast.groupBy = { type: 'group_by', columns: cols };
  }
};

const HavingHandler: ClauseHandler = {
  id: 'HAVING',
  canStart: ({ scan }) => scan.peekKW('HAVING'),
  parse: ({ scan, ast }) => {
    scan.expectKW('HAVING');
    ast.having = parsePredicate(scan);
  }
};

const OrderByHandler: ClauseHandler = {
  id: 'ORDER BY',
  canStart: ({ scan }) => scan.peekKW('ORDER'),
  parse: ({ scan, ast }) => {
    scan.expectKW('ORDER'); scan.expectKW('BY');
    const items: Array<{ expr: any; order: 'ASC' | 'DESC' }> = [];
    while (true) {
      const expr = parseColumnExpr(scan);
      let order: 'ASC' | 'DESC' = 'ASC';
      if (scan.tryKW('DESC')) order = 'DESC';
      else scan.tryKW('ASC');
      items.push({ expr, order });
      if (!scan.tryKW(',')) break;
    }
    ast.orderBy = items;
  }
};

const LimitHandler: ClauseHandler = {
  id: 'LIMIT',
  canStart: ({ scan }) => scan.peekKW('LIMIT'),
  parse: ({ scan, ast }) => {
    scan.expectKW('LIMIT');
    const m = scan.consumeRe(/^\s*\d+/, 'Expected integer after LIMIT');
    ast.limit = parseInt(m[0], 10);
  }
};

const UnionHandler: ClauseHandler = {
  id: 'UNION',
  canStart: ({ scan }) => scan.peekKW('UNION'),
  parse: ({ scan, astList, setAST }) => {
    scan.expectKW('UNION');
    const isAll = scan.tryKW('ALL');

    const topIndex = astList.length - 1;
    // The union AST will be at astList.length.
    // The next select AST will be at astList.length + 1.
    const bottomIndex = astList.length + 1;

    astList.push({
      type: 'union',
      distinct: !isAll,
      top: topIndex,
      bottom: bottomIndex,
    });
    
    // As requested, reset the main AST object to prepare for the next SELECT statement.
    setAST({
      type: 'select', distinct: false, columns: [], from: [], joins: [],
      where: null, groupBy: null, having: null, orderBy: null, limit: null
    });
  }
};

// ---------- Driver ----------
const registry = new ClauseRegistry();
registry.register(SelectHandler);
registry.register(FromHandler);
registry.register(JoinHandler);
registry.register(WhereHandler);
registry.register(GroupByHandler);
registry.register(HavingHandler);
registry.register(OrderByHandler);
registry.register(LimitHandler);
registry.register(UnionHandler); // Register the union handler

const SEQUENCE = [
  'SELECT', 'FROM', 'JOIN*', 
  'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
  'LIMIT',
] as const;

/**
 * Parses a SQL SELECT statement into an Abstract Syntax Tree (AST).
 * This parser uses a scanner and a sequence of clause handlers to build the AST
 * in a structured and extensible way. It supports UNION and UNION ALL.
 * @param {string} sql The SQL query string to parse.
 * @returns {(SelectAST | UnionAST)[]} List of ASTs representing the query.
 * @throws {Error} If the SQL syntax is invalid or contains unexpected tokens.
 */
export function parse(sql: string) {
  let text = sql.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.endsWith(';')) text = text.slice(0, -1);
  const astList: (SelectAST | UnionAST)[] = [];
  const scan = new Scanner(text);

  let ast: SelectAST = {
    type: 'select', distinct: false, columns: [], from: [], joins: [],
    where: null, groupBy: null, having: null, orderBy: null, limit: null
  };

  const ctx: ClauseCtx = {
    scan,
    get ast() { return ast; },
    setAST: (newAst) => { ast = newAst; },
    astList
  };
  
  // The main driver loop. It repeatedly parses a full SELECT statement
  // and then checks for a UNION operator to continue.
  while (!scan.eof()) {
      scan.skipWSAndComments();
      if (scan.eof()) break;

      // Parse one full SELECT statement using the defined sequence of handlers.
      for (const step of SEQUENCE) {
          const repeatable = step.endsWith('*');
          const id = repeatable ? step.slice(0, -1) : step;
          const handler = registry.get(id);

          if (repeatable) {
              while (handler.canStart(ctx)) handler.parse(ctx);
          } else {
              if (handler.canStart(ctx)) handler.parse(ctx);
          }
      }

      // Validate and store the parsed SELECT AST.
      if (ast.columns.length === 0) {
          if (astList.length > 0) { // After a UNION, a SELECT is mandatory.
            throw new Error('Expected SELECT statement after UNION.');
          }
          // If it's the first statement and it's empty, it might be an empty query string.
          break;
      }
      if (ast.from.length === 0) throw new Error('Invalid SQL: Missing FROM clause.');
      astList.push(ast);

      // After a full SELECT statement, check if a UNION follows.
      scan.skipWSAndComments();
      const unionHandler = registry.get('UNION');
      if (unionHandler.canStart(ctx)) {
          // The handler adds the UnionAST and resets the `ast` variable via `setAST`.
          unionHandler.parse(ctx);
      } else {
          // No UNION operator, so the query should be complete.
          break;
      }
  }

  scan.skipWSAndComments();
  if (!scan.eof()) {
    throw new Error(`Unexpected token near: "${scan.rest().slice(0, 40)}"`);
  }

  return astList;
}