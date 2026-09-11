import type ClientStack from "./stack.js";
import Class from "./class.js";
import type { Document, StackSession, ChangesSubscription } from "@docstack/shared";

/**
 * Thrown when a member that belongs to the whole stack - its keys, its auth session,
 * its sync, its lifecycle, its transactions - is reached through a session view.
 *
 * A view is one principal's window onto a shared stack. Letting it turn a key, close
 * the database or install auth material would change what every other session sees,
 * which is exactly the hazard sessions exist to remove (ADR-0046).
 */
export class StackSessionError extends Error {
    override name = "StackSessionError";
    /** The member that was reached. */
    readonly member: string;

    constructor(member: string) {
        super(`'${member}' is not available on a session view: it belongs to the whole stack, not to one session. Call it on the stack itself.`);
        this.member = member;
    }
}

/**
 * A `ClientStack` as one session sees it. Built by {@link ClientStack.forSession}.
 *
 * The same shape as the stack it views - it *is* the stack, with the members a session
 * changes shadowed - so anything written against a `ClientStack` (a `Class`, the query
 * engine, the React hooks) works against a view unchanged.
 */
export type SessionView = ClientStack & {
    /** The session this view is bound to. Frozen: a view cannot widen itself. */
    readonly session: StackSession;
};

/**
 * Members that mutate or expose whole-stack state. Reached through a view they throw
 * {@link StackSessionError}; the list is deliberately explicit so a new whole-stack
 * member has to be added here to become reachable, rather than leaking by default.
 */
const WHOLE_STACK_MEMBERS = [
    "authenticate",
    "setAuthSession",
    "clearAuthSession",
    "unlock",
    "unlockScopes",
    "close",
    "reset",
    "sync",
    "cancelSync",
    "applyPatch",
    "exportContent",
    "importContent",
    "beginTransaction",
    "commit",
    "discardTransaction",
    "forSession",
] as const;

/** `db` methods a session may not call: they change the database for every session. */
const WHOLE_STACK_DB_MEMBERS = new Set(["destroy", "close", "compact", "viewCleanup"]);

/** `get` options that address a revision rather than the winner: those reads serve the stored form. */
const REVISION_ADDRESSED = ["rev", "open_revs", "revs", "revs_info"];

/**
 * Builds the view {@link ClientStack.forSession} returns.
 *
 * `Object.create(stack)` keeps the view on the stack's prototype chain: `instanceof`
 * holds, every member not shadowed here is the stack's own, and the query engine -
 * which reaches data only through `findDocuments`, `findDocumentsIterator` and
 * `getClass().getCards` - runs narrowed when handed the view, the same seam the
 * transaction overlay uses (ADR-0039).
 *
 * What is shadowed, and why:
 * - reads (`findDocuments`, `findDocumentsIterator`, `getDocument`, `query`,
 *   `queryStream`, the live subscriptions) open only what the session is entitled to;
 * - writes (`createDoc`, `createDocs`, `deleteDocument`) carry the session to the
 *   pipeline, which stamps attribution, refuses foreign scopes and hands it to triggers;
 * - `getClass`/`getClassSnapshot` build classes bound to the view, so `Class` writes and
 *   reads route through it; they never subscribe (a view is per request);
 * - `db` is a narrowed handle: winning-revision `get` reads through the session, writes
 *   carry it, destructive members throw; everything else is the guarded handle's own;
 * - whole-stack members throw {@link StackSessionError};
 * - `canApplyQueryLimitEarly` is off: a row the session cannot open at all drops out
 *   after the fetch, so a limit pushed into the index would under-count.
 *
 * @internal
 */
export const createSessionView = (stack: ClientStack, session: StackSession): SessionView => {
    const frozen: StackSession = Object.freeze({
        ...session,
        principal: Object.freeze({ ...session.principal }),
        scopes: Object.freeze([...session.scopes]) as unknown as string[],
    });
    const view: any = Object.create(stack);
    const classes = new Map<string, Promise<Class | null>>();

    Object.defineProperty(view, "session", { value: frozen, enumerable: true, writable: false, configurable: false });

    for (const member of WHOLE_STACK_MEMBERS) {
        Object.defineProperty(view, member, {
            value: () => { throw new StackSessionError(member); },
            enumerable: false,
            writable: false,
            configurable: false,
        });
    }

    // Reads.
    view.findDocuments = (selector: any, fields?: string[], skip?: number, limit?: number, sort?: any) =>
        stack.findDocumentsForView(undefined, selector, fields, skip, limit, sort, frozen);
    view.findDocumentsIterator = (selector: any, options: { fields?: string[]; batchSize?: number } = {}) =>
        stack.findDocumentsIterator(selector, { ...options, session: frozen });
    view.getDocument = (docId: string) => stack.getDocumentForView(frozen, docId);
    view.query = (sql: string, ...params: any[]) => stack.runQuery(sql, params, view);
    view.queryStream = (sql: string, ...params: any[]) => stack.runQueryStream(sql, params, view);
    view.canApplyQueryLimitEarly = async () => false;

    // Writes: the session rides on the options and the plugin does the rest.
    view.createDoc = (docId: string | null, type: string, classObj: any, params: {}) =>
        stack.createDoc(docId, type, classObj, params, { session: frozen });
    view.createDocs = (docs: { docId: string | null; params: {} }[], type: string, classObj: any) =>
        stack.createDocs(docs, type, classObj, { session: frozen });
    view.deleteDocument = (docId: string) => stack.deleteDocument(docId, { session: frozen });

    // Classes bound to the view, one build per class per view, never subscribed.
    const buildClass = (className: string): Promise<Class | null> => {
        let pending = classes.get(className);
        if (!pending) {
            pending = (async () => {
                const model = await stack.getClassModel(className);
                if (!model) return null;
                return Class.buildFromModel(view, model, { subscribe: false });
            })();
            classes.set(className, pending);
        }
        return pending;
    };
    view.getClass = (className: string) => buildClass(className);
    view.getClassSnapshot = (className: string) => buildClass(className);

    // Live subscriptions: the base class's `subscribeClassDocs` is an arrow property
    // bound to the stack, so it would prepare changes for the stack's keyring, not this
    // session's. Same delivery discipline (serialised, one bad change does not end the
    // feed), narrowed through `prepareChangeDocument` with the session.
    const subscribeDocs = (name: string, metaKey: "~class" | "~domain", target: EventTarget, classObj?: Class): ChangesSubscription => {
        const listener = stack.onClassDoc(name, metaKey);
        let queue: Promise<void> = Promise.resolve();
        listener.on("change", (change: any) => {
            queue = queue
                .then(async () => {
                    const detail = change.doc
                        ? { ...change, doc: await stack.prepareChangeDocument(change.doc as Document, classObj, frozen) }
                        : change;
                    target.dispatchEvent(new CustomEvent("doc", { detail }));
                })
                .catch((error: any) => {
                    // eslint-disable-next-line no-console
                    console.error("session view - failed to deliver change", { name, metaKey, session: frozen.id, error });
                });
        });
        return listener;
    };
    view.subscribeClassDocs = (className: string, target: EventTarget, classObj?: Class) =>
        subscribeDocs(className, "~class", target, classObj);
    view.subscribeDomainDocs = (domainName: string, target: EventTarget) =>
        subscribeDocs(domainName, "~domain", target);

    // The database handle, narrowed. Only the winning-revision `get` decrypts on the
    // guarded handle (the plugin's override), so it is the one read routed through the
    // session; `find`, `allDocs` and `bulkGet` serve the stored form already. Writes
    // carry the session so the pipeline treats them like the view's own.
    const withSession = (options: unknown) =>
        typeof options === "function" || options == null
            ? { session: frozen }
            : { ...(options as object), session: frozen };
    const sessionDb: any = new Proxy(stack.db as any, {
        get(target, property, receiver) {
            if (typeof property !== "string") return Reflect.get(target, property, receiver);
            if (WHOLE_STACK_DB_MEMBERS.has(property)) {
                return () => { throw new StackSessionError(`db.${property}`); };
            }
            if (property === "get") {
                return (docId: string, options?: any, callback?: any) => {
                    const revisionAddressed = options && typeof options === "object"
                        && REVISION_ADDRESSED.some((key) => (options as any)[key] !== undefined);
                    if (revisionAddressed) return (target.get as any).call(target, docId, options, callback);
                    const promise = stack.getDocumentForView(frozen, docId).then((doc) => {
                        if (!doc) {
                            throw Object.assign(new Error("missing"), { name: "not_found", status: 404, error: "not_found", reason: "missing" });
                        }
                        return doc;
                    });
                    const cb = typeof options === "function" ? options : callback;
                    if (typeof cb === "function") {
                        promise.then((doc) => cb(null, doc), (error) => cb(error));
                        return undefined;
                    }
                    return promise;
                };
            }
            if (property === "put" || property === "post" || property === "remove") {
                return (doc: any, options?: any, callback?: any) => {
                    if (typeof options === "function") return (target[property] as any).call(target, doc, withSession(undefined), options);
                    return (target[property] as any).call(target, doc, withSession(options), callback);
                };
            }
            if (property === "bulkDocs") {
                return (docs: any, options?: any, callback?: any) => {
                    if (typeof options === "function") return (target.bulkDocs as any).call(target, docs, withSession(undefined), options);
                    return (target.bulkDocs as any).call(target, docs, withSession(options), callback);
                };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    Object.defineProperty(view, "db", { value: sessionDb, enumerable: true, writable: false, configurable: false });

    return view as SessionView;
};
