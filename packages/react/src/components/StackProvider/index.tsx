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

    useEffect(() => {
        if (docStackRef.current === null) {
            console.log("DocStack provider - init instance");
            const instance = new DocStack({ dbName });
            docStackRef.current = instance;
            // You might need to handle initialization or loading states
            // before setting the docStack.
            setDocStack(instance);
        }

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

export default StackProvider;