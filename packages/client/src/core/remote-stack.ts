import {
    Stack,
    type ClassModel,
    type DomainModel,
    type Document,
    type RelationDocument,
    type Patch,
    type ChangesSubscription,
    type SelectAST,
    type UnionAST,
} from "@docstack/shared";
import Class from "./class.js";
import Domain from "./domain.js";
import { StackLockedError, StackScopeMismatchError } from "../plugins/pouchdb.js";

/** A `fetch`-shaped function; the global one by default. */
export type RemoteFetch = (input: string, init?: any) => Promise<any>;

export interface RemoteStackOptions {
    /** The stack's name on this side; what `docstack.getStack(name)` answers to. */
    name: string;
    /** The stack's URL on the server: `https://host/s/<stack>`. */
    url: string;
    /** The bearer token, or a function returning it, sent with every request. Omit for cookie sessions. */
    token?: string | (() => string | Promise<string>);
    /** Extra headers on every request. */
    headers?: Record<string, string>;
    fetch?: RemoteFetch;
}

/**
 * Thrown when a member that only a local engine has - the database handle, sync,
 * keys, transactions - is reached on a remote stack.
 */
export class RemoteStackError extends Error {
    override name = "RemoteStackError";
    readonly member: string;

    constructor(member: string) {
        super(`'${member}' is not available on a remote stack: the engine runs on the server, this stack only calls it.`);
        this.member = member;
    }
}

/** An error answered by the server, carrying its status and CouchDB-shaped body. */
export class RemoteRequestError extends Error {
    override name = "RemoteRequestError";

    constructor(
        readonly status: number,
        readonly error: string,
        reason: string,
        readonly body: Record<string, unknown>,
    ) {
        super(reason);
    }
}

type Listener = (change: any) => void;

/**
 * One server-sent-events connection per stack, carrying every class and domain
 * subscription this stack holds. The subscription set changes the connection: adding
 * or dropping a class reconnects with the new `classes` list and the last sequence
 * seen, so nothing is missed across the switch. Reconnects with backoff on failure.
 */
class RemoteFeed {
    private readonly classes = new Map<string, Set<Listener>>();
    private readonly domains = new Map<string, Set<Listener>>();
    private controller: AbortController | null = null;
    private lastSeq: string | null = null;
    private backoff = 1000;
    private closed = false;
    private scheduled = false;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly base: string,
        private readonly headers: () => Promise<Record<string, string>>,
        private readonly fetchImpl: RemoteFetch,
    ) {}

    subscribe(name: string, metaKey: "~class" | "~domain"): ChangesSubscription {
        const map = metaKey === "~domain" ? this.domains : this.classes;
        let listeners = map.get(name);
        if (!listeners) {
            listeners = new Set();
            map.set(name, listeners);
            this.schedule();
        }
        const owned = new Set<Listener>();
        let cancelled = false;
        const subscription: ChangesSubscription = {
            on: (event: string, listener: Listener) => {
                if (event === "change" && !cancelled) {
                    owned.add(listener);
                    listeners!.add(listener);
                }
                return subscription;
            },
            cancel: () => {
                if (cancelled) return;
                cancelled = true;
                for (const listener of owned) listeners!.delete(listener);
                owned.clear();
                if (!listeners!.size) {
                    map.delete(name);
                    this.schedule();
                }
            },
        } as ChangesSubscription;
        return subscription;
    }

    close(): void {
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        this.controller?.abort();
        this.controller = null;
    }

    /** Coalesces a burst of subscribe/cancel calls into one reconnect. */
    private schedule(): void {
        if (this.scheduled || this.closed) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            void this.reconnect();
        });
    }

    private async reconnect(): Promise<void> {
        if (this.timer) clearTimeout(this.timer);
        this.controller?.abort();
        this.controller = null;
        if (this.closed || (!this.classes.size && !this.domains.size)) return;
        const controller = new AbortController();
        this.controller = controller;
        const params = new URLSearchParams();
        if (this.classes.size) params.set("classes", [...this.classes.keys()].join(","));
        if (this.domains.size) params.set("domains", [...this.domains.keys()].join(","));
        if (this.lastSeq !== null) params.set("since", this.lastSeq);
        try {
            const response = await this.fetchImpl(`${this.base}/_ds/feed?${params.toString()}`, {
                method: "GET",
                headers: { ...(await this.headers()), Accept: "text/event-stream" },
                credentials: "include",
                signal: controller.signal,
            });
            if (!response.ok || !response.body) throw new Error(`feed answered ${response.status}`);
            this.backoff = 1000;
            await this.consume(response.body);
        } catch {
            // fall through to the reconnect below unless we were aborted on purpose
        }
        if (controller.signal.aborted || this.closed || this.controller !== controller) return;
        this.timer = setTimeout(() => void this.reconnect(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 30_000);
    }

    private async consume(body: ReadableStream<Uint8Array>): Promise<void> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
                const raw = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                this.dispatch(raw);
            }
        }
    }

    private dispatch(raw: string): void {
        let event = "message";
        let data = "";
        let id: string | null = null;
        for (const line of raw.split("\n")) {
            if (!line || line.startsWith(":")) continue;
            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
            if (field === "event") event = value;
            else if (field === "data") data += (data ? "\n" : "") + value;
            else if (field === "id") id = value;
        }
        if (id !== null) this.lastSeq = id;
        if (event !== "doc" || !data) return;
        let change: any;
        try {
            change = JSON.parse(data);
        } catch {
            return;
        }
        const listeners = change.class ? this.classes.get(change.class) : change.domain ? this.domains.get(change.domain) : undefined;
        for (const listener of listeners ?? []) listener(change);
    }
}

const CLASS_TTL_MS = 15 * 60_000;

/**
 * A stack that lives on a DocStack server (spec 03 §8).
 *
 * The same contract as `ClientStack` where the hooks and `Class` reach it -
 * `getClass`, `getDomain`, `getClassNames`, `addClass`, `findDocuments`, `query`,
 * `createDoc(s)`, `deleteDocument`, `subscribeClassDocs` - over the server's API
 * surface and a live feed. Nothing is replicated; every read and write runs on the
 * host under the caller's session, so what comes back is what that principal may
 * see. Members that only a local engine has (`db`, `sync`, keys, transactions) throw
 * `RemoteStackError`.
 */
export class RemoteStack extends Stack {
    name: string;
    schemaVersion: string | undefined = undefined;
    /** The engine's patch ledger has no meaning here; kept for consumers that read it. */
    patches: Patch[] = [];
    readonly mode = "remote" as const;
    private readonly base: string;
    private readonly fetchImpl: RemoteFetch;
    private readonly token?: string | (() => string | Promise<string>);
    private readonly extraHeaders: Record<string, string>;
    private readonly feed: RemoteFeed;
    private readonly classCache = new Map<string, { at: number; classObj: Class }>();

    private constructor(options: RemoteStackOptions) {
        super();
        this.name = options.name;
        this.base = options.url.replace(/\/+$/, "");
        this.connection = this.base;
        this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
        this.token = options.token;
        this.extraHeaders = options.headers ?? {};
        this.feed = new RemoteFeed(this.base, () => this.authHeaders(), this.fetchImpl);
        this.db = new Proxy({} as PouchDB.Database<{}>, {
            get: (_target, property) => {
                if (property === "then") return undefined;
                throw new RemoteStackError(`db.${String(property)}`);
            },
        });
    }

    /**
     * Opens a remote stack: verifies the server answers for it (the class list, which
     * also proves the grant reaches the stack) and returns the stack ready to use.
     *
     * @example
     * ```typescript
     * const stack = await RemoteStack.connect({ name: 'my-app', url: 'https://ds.example.com/s/my-app', token });
     * const { rows } = await stack.query('SELECT title FROM Task');
     * ```
     */
    static async connect(options: RemoteStackOptions): Promise<RemoteStack> {
        const stack = new RemoteStack(options);
        await stack.getClassNames();
        return stack;
    }

    private async authHeaders(): Promise<Record<string, string>> {
        const headers: Record<string, string> = { ...this.extraHeaders };
        const token = typeof this.token === "function" ? await this.token() : this.token;
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    /** One call to the API surface; server refusals come back as the engine's own errors. */
    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const response = await this.fetchImpl(`${this.base}${path}`, {
            method,
            headers: { ...(await this.authHeaders()), Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
            credentials: "include",
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : {};
        if (response.ok) return parsed as T;
        const error = typeof parsed.error === "string" ? parsed.error : `http_${response.status}`;
        const reason = typeof parsed.reason === "string" ? parsed.reason : response.statusText;
        if (parsed.name === "StackLockedError") throw new StackLockedError(parsed.className ?? "", parsed.scopeId ?? undefined);
        if (parsed.name === "StackScopeMismatchError") throw new StackScopeMismatchError(parsed.docId ?? "", parsed.scopeId ?? "", undefined);
        throw new RemoteRequestError(response.status, error, reason, parsed);
    }

    // --- classes and domains ---

    getClassNames = async (): Promise<string[]> => {
        return (await this.request<{ classes: string[] }>("GET", "/_ds/classes")).classes;
    };

    getClassModel = async (className: string): Promise<ClassModel | null> => {
        try {
            return (await this.request<{ model: ClassModel }>("GET", `/_ds/classes/${encodeURIComponent(className)}`)).model;
        } catch (error) {
            if (error instanceof RemoteRequestError && error.status === 404) return null;
            throw error;
        }
    };

    getClass = async (className: string, fresh = false): Promise<Class | null> => {
        const cached = this.classCache.get(className);
        if (!fresh && cached && Date.now() - cached.at < CLASS_TTL_MS) return cached.classObj;
        const model = await this.getClassModel(className);
        if (!model) return null;
        const classObj = await Class.buildFromModel(this, model);
        this.classCache.set(className, { at: Date.now(), classObj });
        return classObj;
    };

    getClassSnapshot = async (className: string): Promise<Class | null> => {
        const model = await this.getClassModel(className);
        return model ? Class.buildFromModel(this, model, { subscribe: false }) : null;
    };

    addClass = async (classObj: Class): Promise<ClassModel> => {
        const model = classObj.getModel();
        const result = await this.request<{ id: string; rev: string }>("POST", "/_ds/classes", { model });
        this.classCache.delete(classObj.getName());
        return { ...model, _rev: result.rev };
    };

    updateClass = async (classObj: Class): Promise<Document | null> => {
        const model = classObj.getModel();
        const result = await this.request<{ id: string; rev: string }>("POST", "/_ds/classes", { model });
        this.classCache.delete(classObj.getName());
        return { ...model, _rev: result.rev } as unknown as Document;
    };

    getDomainModel = async (domainName: string): Promise<DomainModel | null> => {
        try {
            return (await this.request<{ model: DomainModel }>("GET", `/_ds/domains/${encodeURIComponent(domainName)}`)).model;
        } catch (error) {
            if (error instanceof RemoteRequestError && error.status === 404) return null;
            throw error;
        }
    };

    getDomain = async (domainName: string, _fresh = false): Promise<Domain | null> => {
        return Domain.fetch(this, domainName);
    };

    addDomain = async (domainObj: Domain): Promise<DomainModel> => {
        const model = domainObj.getModel();
        const result = await this.request<{ id: string; rev: string }>("POST", "/_ds/domains", { model });
        return { ...model, _rev: result.rev };
    };

    // --- reads ---

    findDocuments = async <T extends Document | RelationDocument = Document>(
        selector: { [key: string]: any },
        fields?: string[],
        skip?: number,
        limit?: number,
        sort?: { [field: string]: "asc" | "desc" }[],
    ): Promise<{ [key: string]: any; docs: T[] }> => {
        const result = await this.request<{ docs: T[] }>("POST", "/_ds/find", { selector, fields, skip, limit, sort });
        return { docs: result.docs, selector, skip, limit };
    };

    async findDocument<T extends Document | RelationDocument = Document>(selector: any, fields?: string[], skip?: number, limit?: number): Promise<T | null> {
        const result = await this.findDocuments<T>(selector, fields, skip, limit);
        return result.docs[0] ?? null;
    }

    findDocumentsIterator = async function* <T extends Document | RelationDocument = Document>(
        this: RemoteStack,
        selector: { [key: string]: any },
        options: { fields?: string[]; batchSize?: number } = {},
    ): AsyncGenerator<T, void, void> {
        const result = await this.findDocuments<T>(selector, options.fields);
        for (const doc of result.docs) yield doc;
    };

    async getDocument<T extends Document>(docId: string): Promise<T | null> {
        const result = await this.findDocuments<T>({ _id: { $eq: docId }, active: { $in: [true, false] } }, undefined, 0, 1);
        return result.docs[0] ?? null;
    }

    query = async (sql: string, ...params: any[]): Promise<{ rows: any[]; ast: (SelectAST | UnionAST)[] } | { rows: never[]; ast: null }> => {
        return this.request("POST", "/_ds/query", { sql, params });
    };

    queryStream = async function* (this: RemoteStack, sql: string, ...params: any[]): AsyncGenerator<{ [column: string]: any }, void, void> {
        const result = await this.query(sql, ...params);
        for (const row of result.rows) yield row;
    };

    // --- writes ---

    createDoc = async (docId: string | null, type: string, _classObj: Class | ClassModel["schema"], params: {}): Promise<Document | null> => {
        if (docId) {
            return (await this.request<{ doc: Document }>("PUT", `/_ds/docs/${encodeURIComponent(docId)}`, { type, params })).doc;
        }
        const result = await this.request<{ docs: Document[] }>("POST", "/_ds/docs", { type, docs: [{ docId: null, params }] });
        return result.docs[0] ?? null;
    };

    createDocs = async (docs: { docId: string | null; params: {} }[], type: string, _classObj: Class | ClassModel["schema"]): Promise<Document[]> => {
        return (await this.request<{ docs: Document[] }>("POST", "/_ds/docs", { type, docs })).docs;
    };

    deleteDocument = async (_id: string): Promise<boolean> => {
        try {
            await this.request("DELETE", `/_ds/docs/${encodeURIComponent(_id)}`);
            return true;
        } catch (error) {
            if (error instanceof RemoteRequestError && error.status === 404) return false;
            throw error;
        }
    };

    createRelationDoc = async (docId: string | null, relationName: string, _domainObj: Domain, params: { sourceClass: string; targetClass: string; sourceId: string; targetId: string }): Promise<RelationDocument | null> => {
        const result = await this.request<{ docs: RelationDocument[] }>("POST", "/_ds/relations", { domain: relationName, docs: [{ docId, params }] });
        return result.docs[0] ?? null;
    };

    createRelationDocs = async (docs: { docId: string | null; params: { sourceClass: string; targetClass: string; sourceId: string; targetId: string } }[], relationName: string, _domainObj: Domain): Promise<RelationDocument[]> => {
        return (await this.request<{ docs: RelationDocument[] }>("POST", "/_ds/relations", { domain: relationName, docs })).docs;
    };

    // --- live ---

    onClassDoc = (className: string, metaKey: "~class" | "~domain" = "~class"): ChangesSubscription => {
        const subscription = this.feed.subscribe(className, metaKey);
        this.listeners.push(subscription);
        return subscription;
    };

    // --- lifecycle and what a remote stack does not have ---

    setListeners = (): void => undefined;

    removeAllListeners = (): void => {
        for (const listener of this.listeners.splice(0)) {
            try { listener.cancel(); } catch { /* already gone */ }
        }
    };

    close = (): void => {
        this.removeAllListeners();
        this.feed.close();
        this.classCache.clear();
    };

    /** Sync is the replication surface's business; a remote stack replicates nothing. */
    getSyncStatus = (): null => null;
    getSyncHandle = (): null => null;
    isLocked = (): boolean => false;
    getConsumerSchemaVersion = (): string | null => null;

    dump = (): Promise<PouchDB.Core.AllDocsResponse<{}>> => Promise.reject(new RemoteStackError("dump"));
    addClassLock = (): Promise<boolean> => Promise.reject(new RemoteStackError("addClassLock"));
    clearClassLock = (): Promise<boolean> => Promise.reject(new RemoteStackError("clearClassLock"));
    onClassModelPropagationStart = (): void => { throw new RemoteStackError("onClassModelPropagationStart"); };
    onClassLock = (): ChangesSubscription => { throw new RemoteStackError("onClassLock"); };
    addDesignDocumentPKs = (): Promise<string> => Promise.reject(new RemoteStackError("addDesignDocumentPKs"));
}

export default RemoteStack;
