// src/hooks/useFind.js
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DocStackContext } from '../components/StackProvider/index.js';
import { Document, SelectAST, UnionAST, collectQueryClasses } from '@docstack/client';

/**
 * Hook to execute a SQL query against a specific stack.
 * 
 * Live by default: the query re-runs when a document changes in a class it actually
 * reads, derived from the `ast` the query itself returns. It used to run once and never
 * again, which was invisible beside `useClassDocs` in the same import - one list
 * refreshing next to one that did not. See ADR-0025.
 *
 * @param stack - The name of the stack to query.
 * @param sql - The SQL query string.
 * @param params - Values for the query's `?` placeholders.
 * @param options - See {@link QuerySQLOptions}; `{ live: false }` for a snapshot.
 * @returns The query result (rows and AST), loading state, error, and `refetch`.
 * 
 * @example
 * ```tsx
 * const UserList = () => {
 *     const { result, loading } = useQuerySQL('my-stack', 'SELECT * FROM User WHERE age > ?', 18);
 *     
 *     if (loading) return <div>Loading...</div>;
 *     
 *     return (
 *         <ul>
 *             {result.rows.map(user => <li key={user._id}>{user.name}</li>)}
 *         </ul>
 *     );
 * };
 * ```
 */
export type QuerySQLOptions = {
    /**
     * Re-run when a document changes in a class this query reads. Defaults to `true`.
     *
     * Pass `false` for a deliberate snapshot - and say so at the call site, which the
     * previous behaviour never did.
     */
    live?: boolean;
    /** Coalesce a burst of changes into one re-run, in milliseconds. Defaults to 150. */
    coalesceMs?: number;
};

export const useQuerySQL = (
    stack: string,
    sql: string,
    params: any[] = [],
    options: QuerySQLOptions = {},
) => {
    const { live = true, coalesceMs = 150 } = options;
    const docStack = useContext(DocStackContext);
    const [result, setResult] = useState<{ rows: any[]; ast: (SelectAST | UnionAST)[] | null; }>({ rows: [], ast: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);

    // Which classes to watch. Held in state because it falls out of the first result and
    // drives the subscription effect below.
    const [watched, setWatched] = useState<string[] | null | undefined>(undefined);

    // Stable identities, so the effects key on the query rather than on the render count.
    // The old `queryRef` latch was standing in for this: `params` arrived as a rest
    // parameter, a fresh array every render, so the effect re-ran every render and the
    // latch was the only thing preventing a query storm - at the cost of never re-running
    // at all, including when `sql` changed. See ADR-0025.
    const paramsKey = JSON.stringify(params);
    const paramsRef = useRef(params);
    paramsRef.current = params;

    // Guards against a slow earlier run overwriting a fast later one.
    const runId = useRef(0);

    const runQuery = useCallback(async () => {
        const stackInstance = docStack?.getStack(stack);
        if (!stackInstance) return;

        const id = ++runId.current;
        try {
            const queryResult = await stackInstance.query(sql, ...paramsRef.current);
            if (id !== runId.current) return;
            setResult(queryResult);
            setWatched(collectQueryClasses(queryResult.ast));
            setError(null);
        } catch (err: any) {
            if (id === runId.current) setError(err);
        } finally {
            if (id === runId.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docStack, stack, sql, paramsKey]);

    useEffect(() => {
        if (!docStack) {
            // Null until the provider's `ready` event: startup, not a missing provider.
            // See ADR-0022.
            setLoading(true);
            return;
        }
        setLoading(true);
        runQuery();
    }, [docStack, runQuery]);

    const watchedKey = JSON.stringify(watched ?? null);

    useEffect(() => {
        const stackInstance = docStack?.getStack(stack);
        // `undefined` is "no result yet"; `null` is "the AST could not be accounted for".
        if (!live || !stackInstance || watched === undefined) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let subscriptions: any[] = [];
        const target = new EventTarget();

        const onDoc = () => {
            clearTimeout(timer);
            timer = setTimeout(runQuery, coalesceMs);
        };
        target.addEventListener("doc", onDoc);

        // Fail open. Watching every class is wasteful; watching none is silently wrong,
        // and silence is the failure this hook exists to end. Subscriptions share one
        // database listener, so the wasteful branch costs little. See ADR-0025.
        const resolveClasses = async (): Promise<string[]> => {
            if (watched === null) return stackInstance.getClassNames();
            return watched;
        };

        void resolveClasses().then(classes => {
            if (cancelled) return;
            subscriptions = classes.map(name => stackInstance.subscribeClassDocs(name, target));
        });

        return () => {
            cancelled = true;
            clearTimeout(timer);
            target.removeEventListener("doc", onDoc);
            for (const subscription of subscriptions) stackInstance.releaseListener(subscription);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docStack, stack, live, coalesceMs, watchedKey, runQuery]);

    return { loading, result, error, refetch: runQuery };
}

/**
 * Hook to find documents in a stack using a Mango selector.
 * 
 * @param stack - The name of the stack to query.
 * @param query - Object containing the selector and optional fields projection.
 * @param sort - Optional sort criteria.
 * @param limit - Maximum number of documents to return (default: 50).
 * @returns Object containing the list of documents, loading state, and error.
 * 
 * @example
 * ```tsx
 * const ActiveTasks = () => {
 *     const { docs, loading } = useFind('my-stack', {
 *         selector: { 
 *             "~class": "Task",
 *             active: true 
 *         },
 *         fields: ['_id', 'title']
 *     });
 *     
 *     if (loading) return <div>Loading...</div>;
 *     
 *     return (
 *         <ul>
 *             {docs.map(doc => <li key={doc._id}>{doc.title}</li>)}
 *         </ul>
 *     );
 * };
 * ```
 */
export const useFind = (stack: string, query: {
    selector: { [key: string]: string | number },
    fields?: string[]
}, sort?: any, limit: number = 50) => {
    const docStack = useContext(DocStackContext);
    const [docs, setDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Check if the docStack instance is available
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            // The provider publishes `null` into the context until its `ready`
            // event fires, so this is the normal startup window, not a missing
            // provider. Reporting it as one sends the reader hunting for a bug
            // that is not there - and `setLoading(false)` was worse than the
            // message: it tells a consumer "loaded, and empty" during startup,
            // which is indistinguishable from a genuinely empty result. See
            // ADR-0022.
            setLoading(true);
            return;
        }

        setLoading(true);

        const runQuery = async () => {
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    // Run the initial query
                    const initialDocs = await stackInstance.findDocuments(query.selector, query.fields);
                    if (initialDocs.docs.length) {
                        let docs = initialDocs.docs as Document[]; // [TODO] Check types
                        setDocs(docs);
                    }
                }
                
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        runQuery();

        // A selector names its class directly, so there is no AST to consult - but it has
        // to be subscribed the same way. This used to listen for `docStack`'s `change`,
        // which is dispatched from the replication path and carries a `direction`: a
        // document written locally never produces one, so an implementation built on it
        // would appear to work while syncing and do nothing on the machine where the user
        // is typing. See ADR-0025.
        const className = (query.selector as { [key: string]: any })?.["~class"];
        const stackInstance = docStack.getStack(stack);

        let timer: ReturnType<typeof setTimeout> | undefined;
        let subscription: any;
        const target = new EventTarget();
        const onDoc = () => {
            clearTimeout(timer);
            timer = setTimeout(runQuery, 150);
        };

        if (stackInstance && typeof className === "string" && className) {
            target.addEventListener("doc", onDoc);
            subscription = stackInstance.subscribeClassDocs(className, target);
        }

        return () => {
            clearTimeout(timer);
            target.removeEventListener("doc", onDoc);
            if (stackInstance && subscription) stackInstance.releaseListener(subscription);
        };

    }, [docStack, stack, JSON.stringify(query)]); // Re-run if docStack or query changes

    return { docs, loading, error };
};

export const useClassCreate = () => {
    
}
