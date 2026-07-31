import { ReactNode, createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import {DocStack} from '@docstack/client'; // Import your DocStack class
import { ClientCredentials, StackConfig } from '@docstack/shared';

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
    /** Child components. */
    children?: ReactNode;
}

/**
 * A provider component that initializes the DocStack client and makes it available
 * to child components via the {@link useDocStack} hook.
 * It handles the asynchronous initialization of the stack(s).
 * 
 * @example
 * ```tsx
 * import { StackProvider } from '@docstack/react';
 * 
 * const App = () => (
 *     <StackProvider config={[{ name: 'my-db' }]}>
 *         <MyApp />
 *     </StackProvider>
 * );
 * ```
 */
const StackProvider = (props: DocStackProviderProps) => {
    const { config, children, credentials } = props;
    // Use a ref to store the DocStack instance
    const docStackRef = useRef<DocStack | null>(null);
    const [docStack, setDocStack] = useState<DocStack | null>(null);

    const setsDocStackWhenReady = useCallback(() => {
        setDocStack(docStackRef.current)
    },[]);

    useEffect(() => {
        if (docStackRef.current === null && config.length) {
            console.log("DocStack provider - init instance", {config});
            const mergedConfig = config.map((cfg, idx) => {
                const cred = Array.isArray(credentials) ? credentials[idx] : credentials;
                if (typeof cfg === "string") {
                    return cred ? { connection: cfg, credentials: cred } : cfg;
                }
                return cred ? { ...cfg, credentials: cred } : cfg;
            });
            const instance = new DocStack(...mergedConfig as StackConfig[]);
            docStackRef.current = instance;
            docStackRef.current.addEventListener("ready", setsDocStackWhenReady);
        }

        // Optional: Cleanup function to remove listeners
        return () => {
            if (docStackRef.current) {
                // docStackRef.current.removeEventListener("ready", setsDocStackWhenReady);
                // docStackRef.current.getStore().removeAllListeners();
            }
        };
    }, [config, credentials, setsDocStackWhenReady]);

    return (
        <DocStackContext.Provider value={docStack}>
            {children}
        </DocStackContext.Provider>
    );
};

export default StackProvider;