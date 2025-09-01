import React, { createContext, useEffect, useState } from 'react';
import {DocStack} from '@docstack/client'; // Import your DocStack class

// You can give it a default value, e.g., null, which can be checked later.
export const DocStackContext = createContext<DocStack | null>(null);

export interface DocStackProviderProps {
    dbName: string;
    children?: React.ReactNode;
}
const StackProvider = (props: DocStackProviderProps) => {
    const { dbName, children } = props;
    // Use a ref to store the DocStack instance
    const docStackRef = React.useRef<DocStack | null>(null);
    const [docStack, setDocStack] = useState<DocStack | null>(null);

    const setsDocStackWhenReady = React.useCallback(() => {
        setDocStack(docStackRef.current)
    },[]);

    useEffect(() => {
        if (docStackRef.current === null) {
            console.log("DocStack provider - init instance");
            const instance = new DocStack({ dbName });
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
    }, [dbName, setsDocStackWhenReady]);

    return (
        <DocStackContext.Provider value={docStack}>
            {children}
        </DocStackContext.Provider>
    );
};

export default StackProvider;