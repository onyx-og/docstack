/**
 * Monotone boolean policy -> MSP (monotone span program), Lewko-Waters conversion.
 *
 * Grammar: attr | expr `and` expr | expr `or` expr | (expr); attributes are bare
 * words [A-Za-z0-9:_.-]+ or quoted ("role:manager"). and/or case-insensitive.
 *
 * The MSP is a matrix over Zr with one row per attribute leaf; a set S satisfies
 * the policy iff the rows labeled by S span e1 = (1,0,...,0), and the linear
 * combination is the decryption's reconstruction coefficients.
 */

export type PolicyNode =
    | { kind: "attr"; name: string }
    | { kind: "and" | "or"; left: PolicyNode; right: PolicyNode };

export type Msp = { rows: bigint[][]; labels: string[] };

export const parsePolicy = (source: string): PolicyNode => {
    const tokens = tokenize(source);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    const parseFactor = (): PolicyNode => {
        const token = next();
        if (!token) throw new Error("policy: unexpected end of input");
        if (token === "(") {
            const inner = parseOr();
            if (next() !== ")") throw new Error("policy: missing ')'");
            return inner;
        }
        if (token === ")" || token === "and" || token === "or") {
            throw new Error(`policy: unexpected '${token}'`);
        }
        return { kind: "attr", name: token };
    };
    const parseAnd = (): PolicyNode => {
        let node = parseFactor();
        while (peek() === "and") { next(); node = { kind: "and", left: node, right: parseFactor() }; }
        return node;
    };
    const parseOr = (): PolicyNode => {
        let node = parseAnd();
        while (peek() === "or") { next(); node = { kind: "or", left: node, right: parseAnd() }; }
        return node;
    };

    const tree = parseOr();
    if (pos !== tokens.length) throw new Error(`policy: trailing input from '${tokens[pos]}'`);
    return tree;
};

const tokenize = (source: string): string[] => {
    const tokens: string[] = [];
    const re = /\s*(\(|\)|"[^"]+"|'[^']+'|[A-Za-z0-9:_.\-]+)/gy;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = re.exec(source))) {
        index = re.lastIndex;
        let token = match[1];
        if (token.startsWith('"') || token.startsWith("'")) token = token.slice(1, -1);
        else if (/^(and|or)$/i.test(token)) token = token.toLowerCase();
        tokens.push(token);
    }
    if (index !== source.length && source.slice(index).trim().length) {
        throw new Error(`policy: cannot tokenize at '${source.slice(index)}'`);
    }
    return tokens;
};

/** Lewko-Waters: root (1); OR duplicates the vector; AND splits v -> (v|1), (0..0|-1). */
export const policyToMsp = (tree: PolicyNode, order: bigint): Msp => {
    let width = 1;
    const rows: { vector: bigint[]; label: string }[] = [];
    const walk = (node: PolicyNode, vector: bigint[]): void => {
        if (node.kind === "attr") { rows.push({ vector, label: node.name }); return; }
        if (node.kind === "or") { walk(node.left, vector); walk(node.right, vector); return; }
        const padded = [...vector];
        while (padded.length < width) padded.push(0n);
        const left = [...padded, 1n];
        const right = [...new Array(width).fill(0n), order - 1n]; // -1 mod r
        width += 1;
        walk(node.left, left);
        walk(node.right, right);
    };
    walk(tree, [1n]);
    return {
        rows: rows.map(({ vector }) => {
            const padded = [...vector];
            while (padded.length < width) padded.push(0n);
            return padded;
        }),
        labels: rows.map(({ label }) => label),
    };
};

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
const modInv = (a: bigint, m: bigint): bigint => {
    let [old_r, r] = [mod(a, m), m];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
    }
    if (old_r !== 1n) throw new Error("not invertible");
    return mod(old_s, m);
};

/**
 * Reconstruction: coefficients gamma over the rows whose label is in `attrs`
 * with sum(gamma_i * row_i) = e1, or null when the set does not satisfy the
 * policy. Gaussian elimination over Zr on the transposed system.
 */
export const reconstruct = (msp: Msp, attrs: Set<string>, order: bigint): Map<number, bigint> | null => {
    const selected = msp.labels
        .map((label, index) => ({ label, index }))
        .filter(({ label }) => attrs.has(label));
    if (!selected.length) return null;
    const k = selected.length;
    const width = msp.rows[0].length;

    // A^T gamma = e1: `width` equations over k unknowns, augmented column last.
    const system: bigint[][] = [];
    for (let j = 0; j < width; j++) {
        const equation = selected.map(({ index }) => msp.rows[index][j]);
        equation.push(j === 0 ? 1n : 0n);
        system.push(equation);
    }

    let rank = 0;
    const pivotOfColumn: number[] = [];
    for (let col = 0; col < k && rank < system.length; col++) {
        let pivot = -1;
        for (let row = rank; row < system.length; row++) {
            if (mod(system[row][col], order) !== 0n) { pivot = row; break; }
        }
        if (pivot === -1) continue;
        [system[rank], system[pivot]] = [system[pivot], system[rank]];
        const inv = modInv(system[rank][col], order);
        for (let j = col; j <= k; j++) system[rank][j] = mod(system[rank][j] * inv, order);
        for (let row = 0; row < system.length; row++) {
            if (row === rank) continue;
            const factor = mod(system[row][col], order);
            if (factor === 0n) continue;
            for (let j = col; j <= k; j++) {
                system[row][j] = mod(system[row][j] - factor * system[rank][j], order);
            }
        }
        pivotOfColumn[rank] = col;
        rank += 1;
    }
    // Inconsistent system = policy not satisfied.
    for (let row = rank; row < system.length; row++) {
        if (mod(system[row][k], order) !== 0n) return null;
    }
    const gamma = new Array<bigint>(k).fill(0n); // free variables at zero
    for (let row = 0; row < rank; row++) gamma[pivotOfColumn[row]] = mod(system[row][k], order);

    const result = new Map<number, bigint>();
    selected.forEach(({ index }, position) => {
        if (gamma[position] !== 0n) result.set(index, gamma[position]);
    });
    return result;
};
