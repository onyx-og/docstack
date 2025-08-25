// src/components/DocStackProvider.js
import React, { createContext, useEffect, useState } from 'react';
import {DocStack} from '@docstack/client'; // Import your DocStack class

// You can give it a default value, e.g., null, which can be checked later.
export const DocStackContext = createContext<DocStack | null>(null);

export interface DocStackProviderProps {
    dbName: string;
    children?: React.ReactNode;
}
const DocStackProvider = (props: DocStackProviderProps) => {
    const { dbName, children } = props;
    const [docStack, setDocStack] = useState<DocStack | null>(null);

    useEffect(() => {
        // This effect runs only once when the component mounts
        const instance = new DocStack({ dbName });

        // You might need to handle initialization or loading states
        // before setting the docStack.
        setDocStack(instance);

        // Optional: Cleanup function to close the database when the component unmounts
        // return () => {
        //   if (instance && instance.close) {
        //     instance.close();
        //   }
        // };
    }, [dbName]);

    return (
        <DocStackContext.Provider value={docStack}>
            {children}
        </DocStackContext.Provider>
    );
};

export default DocStackProvider;