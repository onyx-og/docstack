import { ReactNode, createContext, useContext, useRef, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {DocStack} from '@docstack/client'; // Import your DocStack class
import { ClientCredentials, StackConfig } from '@docstack/client';

// You can give it a default value, e.g., null, which can be checked later.
/**
 * Context object for the DocStack instance.
 * It provides the current DocStack instance or null if not initialized.
 */
export const DocStackContext = createContext<DocStack | null>(null);

/**
 * Hook to access the DocStack instance.
 *
 * @returns The current {@link DocStack} instance or null if not yet initialized.
 *
 * @example
 * ```tsx
 * const MyComponent = () => {
 *     const docStack = useDocStack();
 *
 *     if (!docStack) return <div>Loading...</div>;
 *
 *     return <div>Connected to {docStack.getStacks().length} stacks</div>;
 * };
 * ```
 */
export const useDocStack = () => {
    return useContext(DocStackContext);
};

/**
 * The name a configuration entry will end up carrying as a stack.
 *
 * Mirrors `DocStack.resolveStackConfig`: a string configuration *is* the name, an
 * object's `name` wins, and a connection-only entry is identified by its connection.
 *
 * @param config - One stack configuration.
 * @returns The identifier to reconcile on.
 */
const stackKey = (config: StackConfig): string => {
    if (typeof config === 'string') return config;
    return config.name || (config as { connection?: string }).connection || '';
};

/**
 * Merges the `credentials` prop into the configurations it applies to.
 *
 * @param config - The configurations as given.
 * @param credentials - One credential for every stack, or one per configuration entry.
 * @returns Configurations with credentials folded in.
 */
const mergeCredentials = (
    config: StackConfig[],
    credentials?: ClientCredentials | ClientCredentials[]
): StackConfig[] => config.map((cfg, idx) => {
    const cred = Array.isArray(credentials) ? credentials[idx] : credentials;
    if (typeof cfg === 'string') {
        return cred ? { connection: `db-${cfg}`, name: cfg, credentials: cred } : cfg;
    }
    return cred ? { ...cfg, credentials: cred } : cfg;
}) as StackConfig[];

/**
 * Props for the {@link StackProvider} component.
 *
 * @example
 * ```ts
 * const props: DocStackProviderProps = {
 *     config: [{ name: 'my-app' }],
 *     credentials: { username: 'admin', password: 'password' }
 * };
 * ```
 */
export interface DocStackProviderProps {
    /** Configuration(s) for the stack(s) to initialize. */
    config: StackConfig[];
    /** Credentials for the stack(s). Can be a single object or an array matching the config. */
    credentials?: ClientCredentials | ClientCredentials[];
    /**
     * Delete the underlying database when a stack drops out of `config`. Defaults to
     * `false`: a workspace that disappears from the configuration is closed, not erased.
     */
    destroyRemovedStacks?: boolean;
    /** Child components. */
    children?: ReactNode;
}

/**
 * A provider component that initializes the DocStack client and makes it available
 * to child components via the {@link useDocStack} hook.
 *
 * The `config` prop is reconciled rather than read once: a stack that appears in it is
 * opened, a stack that disappears is closed, and the stacks either side of the change
 * are left running. An application whose set of databases grows at runtime - one per
 * workspace, say - therefore does not have to reload to pick up a new one, which
 * matters once each stack also carries a live replication that a reload would drop.
 *
 * @example
 * ```tsx
 * import { StackProvider } from '@docstack/react';
 *
 * const App = () => {
 *     const workspaces = useWorkspaces();
 *     const config = useMemo(
 *         () => [{ name: 'app' }, ...workspaces.map(w => ({ name: `ws-${w.slug}` }))],
 *         [workspaces]
 *     );
 *     return (
 *         <StackProvider config={config}>
 *             <MyApp />
 *         </StackProvider>
 *     );
 * };
 * ```
 */
const StackProvider = (props: DocStackProviderProps) => {
    const { config, children, credentials, destroyRemovedStacks } = props;
    // Use a ref to store the DocStack instance
    const docStackRef = useRef<DocStack | null>(null);
    const [docStack, setDocStack] = useState<DocStack | null>(null);
    // The DocStack instance is stable across reconciliations, so adding or removing a
    // stack changes nothing React can see by itself.
    const [, signalStacksChanged] = useReducer((count: number) => count + 1, 0);
    // Reconciliations are serialized: opening a database is asynchronous and two
    // overlapping passes would race to add the same stack twice.
    const reconciling = useRef<Promise<unknown>>(Promise.resolve());

    const mergedConfig = useMemo(
        () => mergeCredentials(config, credentials),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(config), JSON.stringify(credentials)]
    );

    const setsDocStackWhenReady = useCallback(() => {
        setDocStack(docStackRef.current)
    },[]);

    useEffect(() => {
        if (!mergedConfig.length) return;

        if (docStackRef.current === null) {
            console.log("DocStack provider - init instance", { config: mergedConfig });
            const instance = new DocStack(...mergedConfig);
            docStackRef.current = instance;
            instance.addEventListener("ready", setsDocStackWhenReady);
            instance.addEventListener("stack-added", signalStacksChanged);
            instance.addEventListener("stack-removed", signalStacksChanged);
            return;
        }

        const instance = docStackRef.current;
        let cancelled = false;

        const reconcile = async () => {
            if (cancelled) return;

            const wanted = new Map(mergedConfig.map(cfg => [stackKey(cfg), cfg]));

            for (const stack of [...instance.getStacks()]) {
                if (cancelled) return;
                if (!wanted.has(stack.name)) {
                    console.log("DocStack provider - closing stack dropped from config", { name: stack.name });
                    await instance.removeStack(stack.name, { destroy: destroyRemovedStacks });
                }
            }

            for (const [name, cfg] of wanted) {
                if (cancelled) return;
                if (!instance.getStack(name)) {
                    console.log("DocStack provider - opening stack added to config", { name });
                    await instance.addStack(cfg);
                }
            }
        };

        reconciling.current = reconciling.current.then(reconcile).catch(error => {
            console.error("DocStack provider - failed to reconcile stacks", error);
        });

        return () => {
            cancelled = true;
        };
    }, [mergedConfig, destroyRemovedStacks, setsDocStackWhenReady]);

    return (
        <DocStackContext.Provider value={docStack}>
            {children}
        </DocStackContext.Provider>
    );
};

export default StackProvider;
