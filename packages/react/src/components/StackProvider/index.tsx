import { ReactNode, createContext, useRef, useCallback, useEffect, useState } from 'react';
import {DocStack} from '@docstack/client'; // Import your DocStack class
import { ClientCredentials, StackConfig } from '@docstack/shared';

// You can give it a default value, e.g., null, which can be checked later.
export const DocStackContext = createContext<DocStack | null>(null);

export interface DocStackProviderProps {
    config: StackConfig[];
    credentials?: ClientCredentials | ClientCredentials[];
    children?: ReactNode;
}
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