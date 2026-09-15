import type { Patch, StackOptions } from "@docstack/shared";

/**
 * Who is asking. Extracted from a bearer JWT, the node's own session cookie, or Basic
 * credentials against the credential store, before any route runs.
 */
export interface Principal {
    /** Stable subject identifier: the JWT `sub`, or the username. */
    sub: string;
    /** The attribute set the host derived for this principal (`role:hr`, `tenant:acme`). */
    attributes: string[];
    /** The verified claims, or the credential record's fields, for the grant function to read. */
    claims: Record<string, unknown>;
    /** How the principal was established. */
    via: "bearer" | "cookie" | "basic";
}

/** Class filtering on the replication surface, the client's `ClassFilterOptions` shape. */
export interface GrantClassFilter {
    include?: string[];
    exclude?: string[];
    includeDataModel?: boolean;
}

/** What one principal may do with one stack. Omitted booleans are `false`. */
export interface StackGrant {
    /** The API surface: reads, writes and the feed under a session. */
    api?: boolean;
    /** The replication surface, per direction (phase 3). */
    pull?: boolean;
    push?: boolean;
    /** Class filtering on replication. */
    classes?: GrantClassFilter;
    /** What may leave on replication, ANDed with `classes`. */
    serve?: (doc: any) => boolean;
    /**
     * What may arrive on replication, and which class or domain model writes the API
     * admits. Absent, the API refuses model writes and replication accepts every
     * document the class filter admits.
     */
    accept?: (doc: any) => boolean;
    /** May open content sealed under the stack's document key (API), or receive the key over the channel. */
    documentKey?: boolean;
    /** May destroy the stack over the replication surface. */
    allowDestroy?: boolean;
}

/** The grant function's result: every stack the principal can reach, by name or template pattern (`user-*`). */
export interface Grant {
    stacks: Record<string, StackGrant>;
    /** What `keygen` sees for this principal; defaults to the principal's attributes. */
    attributes?: string[];
    /** May load the workbench. */
    ui?: boolean;
}

/** The authority's material: the CP-ABE public key and master secret key from `@docstack/abe`'s `setup()`. */
export interface AuthorityMaterial {
    pk: string;
    msk: string;
}

/** One entry of `stacks` or `stackTemplates`: the client's `StackOptions` plus the host's own keys. */
export type HostStackConfig = Omit<StackOptions, "name"> & {
    patches?: Patch[];
    /** The document key for this stack, overriding `keys.documentKey`. */
    documentKey?: string;
    /** Jobs allowed to run unattended on this stack (phase 5). */
    jobs?: { allow: string[]; pinnedHashes?: Record<string, string> };
};

/** A credential record in the host's own store. */
export interface UserRecord {
    username: string;
    attributes: string[];
    /** Material a replica needs to unwrap its document key locally; the host never learns the key. */
    keyDerivationSalt?: string;
    wrappedDocumentKey?: string;
    /** Free-form fields the grant function may read through `principal.claims`. */
    claims?: Record<string, unknown>;
}
