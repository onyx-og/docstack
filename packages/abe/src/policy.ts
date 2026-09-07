/**
 * The attribute-policy language and its normalizer.
 *
 * DocStack's one access-control language (ADR-0045, spec 02 §1): quoted
 * attributes composed with `and`/`or` and parentheses — monotone by
 * construction, no negation, no data-dependence. This module is the ONLY path
 * a policy string takes into the ABE layer: rabe's MSP converter panics on
 * unparenthesized AND-chains of length ≥ 3 (characterized in
 * `spikes/abe/bench/rabe-probe.ts`), so every formula is parsed here and
 * re-emitted as a fully parenthesized, BALANCED binary tree before it reaches
 * the scheme. Authors write formulas naturally; the wire form is canonical.
 */

export type PolicyNode =
    | { kind: "attr"; name: string }
    | { kind: "op"; op: "and" | "or"; children: PolicyNode[] };

type Token =
    | { kind: "attr"; name: string }
    | { kind: "and" }
    | { kind: "or" }
    | { kind: "open" }
    | { kind: "close" };

const tokenize = (policy: string): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < policy.length) {
        const ch = policy[i];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
        if (ch === "(") { tokens.push({ kind: "open" }); i++; continue; }
        if (ch === ")") { tokens.push({ kind: "close" }); i++; continue; }
        if (ch === '"') {
            const end = policy.indexOf('"', i + 1);
            if (end === -1) throw new Error(`Policy has an unterminated quoted attribute at position ${i}.`);
            const name = policy.slice(i + 1, end);
            if (!name.trim()) throw new Error("Policy contains an empty attribute name.");
            tokens.push({ kind: "attr", name });
            i = end + 1;
            continue;
        }
        // A bare word: and / or, case-insensitive. Anything else is refused
        // loudly — including every negation spelling, which the monotone
        // language deliberately lacks.
        const match = /^[A-Za-z_][A-Za-z0-9_:-]*/.exec(policy.slice(i));
        if (!match) throw new Error(`Unexpected character '${ch}' in policy at position ${i}.`);
        const word = match[0];
        const lower = word.toLowerCase();
        if (lower === "and") tokens.push({ kind: "and" });
        else if (lower === "or") tokens.push({ kind: "or" });
        else if (lower === "not" || lower === "nand" || lower === "nor") {
            throw new Error(`Policy operator '${word}' is not part of the monotone language: no negation exists. Model the positive attribute instead.`);
        } else {
            throw new Error(`Unquoted word '${word}' in policy: attributes must be double-quoted, e.g. "role:manager".`);
        }
        i += word.length;
    }
    return tokens;
};

/** Recursive-descent parse; `and` binds tighter than `or` (the conventional precedence). */
export const parsePolicy = (policy: string): PolicyNode => {
    const tokens = tokenize(policy);
    let position = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];

    const primary = (): PolicyNode => {
        const token = take();
        if (!token) throw new Error("Policy ended where an attribute or '(' was expected.");
        if (token.kind === "attr") return { kind: "attr", name: token.name };
        if (token.kind === "open") {
            const node = orExpr();
            const close = take();
            if (!close || close.kind !== "close") throw new Error("Policy has an unbalanced '('.");
            return node;
        }
        throw new Error("Policy has an operator where an attribute or '(' was expected.");
    };

    const andExpr = (): PolicyNode => {
        const children = [primary()];
        while (peek()?.kind === "and") { take(); children.push(primary()); }
        return children.length === 1 ? children[0] : { kind: "op", op: "and", children };
    };

    const orExpr = (): PolicyNode => {
        const children = [andExpr()];
        while (peek()?.kind === "or") { take(); children.push(andExpr()); }
        return children.length === 1 ? children[0] : { kind: "op", op: "or", children };
    };

    const root = orExpr();
    if (position !== tokens.length) throw new Error("Policy has trailing content after a complete formula (an unbalanced ')' or a missing operator).");
    return root;
};

/** Flattens nested same-op nodes so chains balance across author parenthesization. */
const flatten = (node: PolicyNode): PolicyNode => {
    if (node.kind === "attr") return node;
    const children: PolicyNode[] = [];
    for (const child of node.children.map(flatten)) {
        if (child.kind === "op" && child.op === node.op) children.push(...child.children);
        else children.push(child);
    }
    return { kind: "op", op: node.op, children };
};

/** Emits a chain as a balanced binary tree — the shape rabe's converter accepts at any length. */
const emitBalanced = (nodes: PolicyNode[], op: "and" | "or"): string => {
    if (nodes.length === 1) return emit(nodes[0]);
    const mid = Math.ceil(nodes.length / 2);
    return `(${emitBalanced(nodes.slice(0, mid), op)} ${op} ${emitBalanced(nodes.slice(mid), op)})`;
};

const emit = (node: PolicyNode): string =>
    node.kind === "attr" ? `"${node.name}"` : emitBalanced(node.children, node.op);

/**
 * Parses and re-emits a policy in canonical form: attributes quoted, every
 * operator application parenthesized, same-op chains balanced. Throws on
 * anything outside the language — the loud refusal is the API.
 */
export const normalizePolicy = (policy: string): string => emit(flatten(parsePolicy(policy)));

/** The attribute names a formula mentions, in first-appearance order. */
export const policyAttributes = (policy: string): string[] => {
    const seen = new Set<string>();
    const walk = (node: PolicyNode) => {
        if (node.kind === "attr") seen.add(node.name);
        else node.children.forEach(walk);
    };
    walk(parsePolicy(policy));
    return [...seen];
};
