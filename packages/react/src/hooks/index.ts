// src/hooks/useFind.js
import { useContext, useEffect, useRef, useState } from 'react';
import { DocStackContext } from '../components/StackProvider';
import { Document, SelectAST, UnionAST } from '@docstack/shared';

export const useQuerySQL = (stack: string, sql: string, ...params: any[]) => {
    const docStack = useContext(DocStackContext);
    const [result, setResult] = useState<{ rows: any[]; ast: (SelectAST | UnionAST)[] | null; }>({ rows: [], ast: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // [TODO] Solve bounce of component because of StrictMode or other reasons
    const queryRef = useRef(false);

    useEffect( () => {
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            console.error('useClassList must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }

        const runQuery = async () => {
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    // Run the initial query
                    console.log("Preparing to run query", {sql, params})
                    debugger
                    const queryResult = await stackInstance.query(sql, ...params);
                    setResult(queryResult);

                } else {
                    console.log("Could not find corresponding stack", {stack})
                }
            } catch (err: any) {
                console.log("Got error while running query", {error: err})
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        if (!queryRef.current) {
            queryRef.current = true;
            setLoading(true);
            runQuery();
        } else {
            console.log("Already performing query");
        }
        

        return () => {
            //
        }

    }, [docStack, stack, params]);

    return { loading, result, error };
}

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
            console.error('useFind must be used within a DocStackProvider.');
            setLoading(false);
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
