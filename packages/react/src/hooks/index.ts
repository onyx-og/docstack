// src/hooks/useFind.js
import { useContext, useEffect, useState } from 'react';
import { DocStackContext } from '../components/StackProvider';
import { Document } from '../../../shared/src/types';
import { Class } from '@docstack/client';

export const useFind = (query: {
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
            console.error('useFind must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }

        setLoading(true);

        const runQuery = async () => {
            try {
                // Run the initial query
                const initialDocs = await docStack.getStore().findDocuments(query.selector, query.fields);
                if (initialDocs.docs.length) {
                    let docs = initialDocs.docs as Document[]; // [TODO] Check types
                    setDocs(docs);
                }
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        runQuery();

        // Set up the listener for changes
        const changeListener = (change: any) => {
            // Logic to handle the change and update the docs state
            // This part is crucial for real-time updates.
            // You'll need to re-run the query or intelligently update the docs array
            // based on the change object (add, update, delete).
            // A simple way is to re-run the query.
            // runQuery();
        };

        // [TODO] Implement events
        docStack.addEventListener('change', changeListener);

        // Cleanup function: remove the listener when the component unmounts
        return () => {
            docStack.removeEventListener('change', changeListener);
        };

    }, [docStack, JSON.stringify(query)]); // Re-run if docStack or query changes

    return { docs, loading, error };
};

export const useClassCreate = () => {
    
}

export const useClassDocs = (className: string, query = {}) => {
    const docStack = useContext(DocStackContext);

    const [classObj, setClass] = useState<Class>();
    const [docs, setDocs] = useState<Document[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Only run if the docStack is available and a className is provided
        if (!docStack || !className) {
            setLoading(false);
            return;
        }

        const fetchClass = async () => {
            setLoading(true);
            setError(null);
            try {
                const stackInstance = docStack.getStore();
                const retrievedClass = await stackInstance.getClass(className);

                setClass(retrievedClass);
            } catch (err: any) {
                setError(err);
                setLoading(false);
            }
        };

        fetchClass();

        return () => {
            // clean what?
        };
    }, [docStack, className]); // Dependency on docStack and className

    useEffect(() => {
        if (!classObj) {
            return;
        }

        const runQueryAndListen = async () => {
            setLoading(true);
            try {
                const initialDocs = await classObj.getCards(query) as Document[];
                setDocs(initialDocs);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

            /*  // [TODO]
            const changeListener = (change) => {
                //
            };

            classObj.on('change', changeListener);

            return () => {
                classObj.off('change', changeListener);
            };
            */
        };

        runQueryAndListen();
    }, [classObj, JSON.stringify(query)]); // Dependency on classObj and query

    return { docs, loading, error };
};
