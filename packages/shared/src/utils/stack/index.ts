import {
    CachedClass,
    Document,
    StackOptions,
    ClassModel,
    Patch,
    CachedDomain,
    DomainModel,
    SelectAST,
    UnionAST,
    RelationDocument,
    AuthSessionProof,
    ChangesSubscription,
} from "../../types.js";

import Class from "./class/index.js";
import Domain from "./domain.js";

abstract class Stack extends EventTarget {
    /* Initialized asynchronously */
    public db!: PouchDB.Database<{}>;
    /* Retrieved asynchronously */
    public lastDocId!: number;
    /* Populated on async constructor */
    public connection!: string;
    public options?: StackOptions;
    abstract name: string;
    public appVersion: string = "0.0.1";
    abstract schemaVersion: string | undefined;
    /* Used to retrieve faster data */
    public cache: {
        [className: string]: CachedClass | CachedDomain
    } = {}
    public patchCount!: number;

    /**
     * Every live changes subscription this stack has handed out.
     *
     * Held so {@link removeAllListeners} can release them on close. Entries are removed
     * by {@link releaseListener}, so a long-lived stack that repeatedly subscribes and
     * unsubscribes does not grow this array.
     */
    listeners: ChangesSubscription[] = [];

    modelWorker: Worker | null = null;
    jobEngine?: unknown;
    authSession?: AuthSessionProof;

    abstract dump: () => Promise<PouchDB.Core.AllDocsResponse<{}>>;

    abstract setListeners: () => void;

    abstract close: () => void;

    abstract removeAllListeners: () => void;

    abstract getClass: (className: string, fresh?: boolean) => Promise<Class | null>;

    abstract getDomain: (domainName: string, fresh?: boolean) => Promise<Domain | null>;

    abstract addClass: (classObj: Class) => Promise<ClassModel>;

    abstract addDomain: (domainObj: Domain) => Promise<DomainModel>;

    abstract updateClass: (classObj: Class) => Promise<Document | null>;

    abstract addClassLock: (className: string) => Promise<boolean>;

    abstract clearClassLock: (className: string) => Promise<boolean>;

    abstract onClassModelPropagationStart: (event: CustomEvent<any>) => void;

    abstract onClassLock: (className: string) => ChangesSubscription;

    /**
     * Opens a subscription to the documents of one class, or of one domain.
     *
     * `metaKey` selects which field names the document's owner: `~class` for a class's
     * documents, `~domain` for a domain's relation documents. They are separate
     * keyspaces - a relation carries `~domain` and no `~class` at all
     * (`RelationDocument` types it as `"~class"?: never`) - so a subscription for one
     * never receives the other's documents.
     *
     * Prefer {@link subscribeClassDocs} / {@link subscribeDomainDocs}, which route
     * changes through {@link prepareChangeDocument}.
     */
    abstract onClassDoc: (className: string, metaKey?: "~class" | "~domain") => ChangesSubscription;

    /**
     * Prepares a document from the changes feed for delivery to a listener.
     *
     * The base implementation passes it through, which is correct for a stack that does
     * not encrypt. A stack that does overrides this: the feed bypasses the plugin that
     * decrypts reads, so a stored encrypted attribute would otherwise reach a consumer as
     * its raw payload. See ADR-0020.
     *
     * @param doc - The document from `change.doc`.
     * @param classObj - The class, when the caller has one.
     */
    prepareChangeDocument = async (doc: Document, classObj?: Class): Promise<Document> => doc;

    /**
     * Subscribes an event target to a class's document changes.
     *
     * Prefer this over wiring {@link onClassDoc} directly. It routes every change through
     * {@link prepareChangeDocument}, so a subclass that encrypts cannot forget to decrypt
     * on this path, and it serialises the handlers: preparing a document is asynchronous,
     * so two rapid changes to one document could otherwise be dispatched in whichever
     * order their preparation happened to finish. The change's `seq` still rides along
     * for consumers that want to discard a stale update independently.
     *
     * @param className - The class whose documents to watch.
     * @param target - Receives the `doc` events.
     * @param classObj - The class, when the caller has one.
     * @returns The underlying changes listener.
     */
    subscribeClassDocs = (className: string, target: EventTarget, classObj?: Class): ChangesSubscription => {
        return this.subscribeDocs(className, "~class", target, classObj);
    };

    /**
     * Subscribes an event target to a domain's relation documents.
     *
     * The Domain counterpart to {@link subscribeClassDocs}, and it needs to be a separate
     * call rather than the same one: a relation document is named by `~domain` and has no
     * `~class`, so subscribing it as if it were a class matches nothing and the target
     * simply never hears anything.
     *
     * @param domainName - The domain whose relations to watch.
     * @param target - Receives the `doc` events.
     * @returns The underlying subscription.
     */
    subscribeDomainDocs = (domainName: string, target: EventTarget): ChangesSubscription => {
        return this.subscribeDocs(domainName, "~domain", target);
    };

    /**
     * Shared delivery for {@link subscribeClassDocs} and {@link subscribeDomainDocs}.
     *
     * Every change goes through {@link prepareChangeDocument}, so a subclass that
     * encrypts cannot forget to decrypt on this path, and handlers are serialised:
     * preparing a document is asynchronous, so two rapid changes to one document could
     * otherwise be dispatched in whichever order their preparation happened to finish.
     * The change's `seq` still rides along for consumers that want to discard a stale
     * update independently.
     */
    private subscribeDocs = (
        name: string,
        metaKey: "~class" | "~domain",
        target: EventTarget,
        classObj?: Class,
    ): ChangesSubscription => {
        const listener = this.onClassDoc(name, metaKey);

        let queue: Promise<void> = Promise.resolve();
        listener.on("change", (change: any) => {
            queue = queue
                .then(async () => {
                    // A deletion carries no `doc`; forward it untouched.
                    const detail = change.doc
                        ? { ...change, doc: await this.prepareChangeDocument(change.doc as Document, classObj) }
                        : change;
                    target.dispatchEvent(new CustomEvent("doc", { detail }));
                })
                .catch((error: any) => {
                    // One bad change must not end the subscription - the chain has to
                    // survive to deliver the next one.
                    // eslint-disable-next-line no-console
                    console.error("subscribeDocs - failed to deliver change", { name, metaKey, error });
                });
        });

        return listener;
    };

    /**
     * Cancels a subscription and forgets it.
     *
     * The counterpart to {@link subscribeClassDocs}: a caller that is done watching must
     * call this rather than dropping the handle, because the subscription keeps the
     * underlying feed - and everything the handler closes over - alive on its own.
     * Safe to call with a handle that is already cancelled, or with nothing at all.
     *
     * @param listener - The handle to release.
     */
    releaseListener = (listener?: ChangesSubscription | null) => {
        if (!listener) return;

        const index = this.listeners.indexOf(listener);
        if (index !== -1) this.listeners.splice(index, 1);

        try {
            listener.cancel();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("releaseListener - failed to cancel", { error });
        }
    };

    abstract createDoc: (docId: string | null, type: string,classObj: Class | ClassModel["schema"], params: {}) => Promise<Document | null>;

    abstract createDocs: ( docs: {docId: string | null, params: {}}[], type: string, classObj: Class | ClassModel["schema"] ) => Promise<Document[]>;

    abstract createRelationDoc: (docId: string | null, relationName: string, domainObj: Domain, params: {
        sourceClass: string,
        targetClass: string,
        sourceId: string,
        targetId: string
    }) => Promise<RelationDocument | null>;

    abstract createRelationDocs: ( docs: {docId: string | null, params: {
        sourceClass: string,
        targetClass: string,
        sourceId: string,
        targetId: string
    }}[], relationName: string, domainObj: Domain ) => Promise<RelationDocument[]>;

    abstract findDocuments: <T extends Document | RelationDocument>(selector: {[key: string]: any}, fields?: string[], skip?: number, limit?: number ) => Promise<{
        [key: string]: any;
        docs: T[];
    }>;


    abstract getClassModel: (className: string) => Promise<ClassModel | null>;

    abstract getDomainModel: (domainName: string) => Promise<DomainModel | null>;

    abstract deleteDocument: (_id: string) => Promise<boolean>;

    abstract addDesignDocumentPKs: (className: string, pKs: string[], temp?: boolean) => Promise<string>;

    abstract query: (sql: string, ...params: any[]) => Promise<{ rows: any[]; ast: (SelectAST | UnionAST)[]; } | { rows: never[]; ast: null; }>;
}

export default Stack;