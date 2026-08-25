import { useContext, useCallback, useEffect, useRef, useState } from "react";
import { DocStackContext } from "../components/StackProvider/index.js";
import { Class } from "@docstack/client";
import {ClassModel, Document} from "@docstack/client";

/**
 * Hook to create a new Class in a specific stack.
 * 
 * @param stack - The name of the stack to create the class in.
 * @returns A callback function to create the class.
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *     const createClass = useClassCreate('my-stack');
 *     
 *     const handleCreate = async () => {
 *         const newClass = await createClass('NewClass', 'Description of new class');
 *         if (newClass) {
 *             console.log('Class created:', newClass.name);
 *         }
 *     };
 *     
 *     return <button onClick={handleCreate}>Create Class</button>;
 * };
 * ```
 */
export const useClassCreate = (stack: string) => {
    const docStack = useContext(DocStackContext);

    return useCallback(
        async ( className: string, classDesc?: string) => {
            try {
                if (!docStack) {
                    // Handle the case where the provider is not yet initialized or missing
                    // You could throw an error or return an empty state.
                    console.error('useClassCreate must be used within a DocStackProvider.');
                    // setLoading(false);
                    return Promise.resolve(null);
                }
                // Run the initial query
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const classObj_ = await Class.create(stackInstance, className, "class", classDesc);
                    await stackInstance.addClass(classObj_);
                    return classObj_;
                }
                return null;
                
            } catch (err: any) {
                // setError(err);
                console.error(err);
                return null;
            }
        }, [docStack, stack]
    );
}

/**
 * Hook to retrieve a list of classes from a stack based on a selector.
 * Maintains a real-time list of classes matching the selector.
 * 
 * @param stack - The name of the stack to query.
 * @param selector - Mango selector to filter classes.
 * @returns Object containing the list of classes, loading state, and error.
 * 
 * @example
 * ```tsx
 * const ClassList = () => {
 *     const { classList, loading } = useClassList('my-stack', {
 *         name: { $regex: '^User' }
 *     });
 *     
 *     if (loading) return <div>Loading...</div>;
 *     
 *     return (
 *         <ul>
 *             {classList.map(cls => <li key={cls.id}>{cls.name}</li>)}
 *         </ul>
 *     );
 * };
 * ```
 */
export const useClassList = (stack: string, selector: {[key: string]: any}) => {
    const docStack = useContext(DocStackContext);
    const [originClass, setOriginClass] = useState<Class>();
    const [classList, setClassList] = useState<Class[]>([]);
    const classListRef = useRef<Class[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    

    useEffect(() => {
        // Only run if the docStack is available and a className is provided
        if (!docStack) {
            setLoading(false);
            return;
        }

        const fetchClass = async () => {
            setLoading(true);
            setError(null);
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const retrievedClass = await stackInstance.getClass('class');
                    if (retrievedClass) {
                        setOriginClass(retrievedClass);
                    }
                }
                
            } catch (err: any) {
                setError(err);
                setLoading(false);
            }
        };

        fetchClass();

        return () => {
            // clean what?
        };
    }, [docStack, stack]); // Dependency on docStack and stack

    useEffect(() => {
        if (!originClass) {
            return;
        }

        let cancelled = false;
        let attached: EventListener | null = null;

        const runQueryAndListen = async () => {
            setLoading(true);
            try {
                const initialClassModelList = await originClass.getCards(selector) as ClassModel[];
                const initialClassList: Class[] = [];
                const stackInstance = docStack!.getStack(stack);
                for (const cls of initialClassModelList) {
                    const classInstance = await Class.buildFromModel(stackInstance!, cls);
                    initialClassList.push(classInstance);
                }
                if (cancelled) {
                    // The effect was torn down mid-query; these were built anyway, and
                    // each one holds a live subscription until it is closed.
                    for (const classInstance of initialClassList) classInstance.close();
                    return;
                }
                classListRef.current = initialClassList;
                setClassList(classListRef.current);
            } catch (err: any) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
            if (cancelled) return;

            const changeListener = (change: CustomEvent) => {
                const doc = change.detail.doc;
                console.log("useClassDocs - detail", {detail: change.detail});
                if (!doc.active) {
                    // A doc was deleted
                    console.log("useClassDocs - a doc was deleted", {doc});
                    const docIndex = classListRef.current.findIndex((d) => d.id == doc._id)
                    if (docIndex != -1) {
                        classListRef.current = [
                            ...classListRef.current.slice(0, docIndex),
                            ...classListRef.current.slice(docIndex+1, classListRef.current.length)
                        ];
                    }
                } else {
                    // A doc was changed or added
                    const docIndex = classListRef.current.findIndex((d) => d.id == doc._id)
                    if (docIndex != -1) {
                        // A doc was changed
                        classListRef.current = [
                            ...classListRef.current.slice(0, docIndex),
                            doc,
                            ...classListRef.current.slice(docIndex+1, classListRef.current.length)
                        ];
                    } else {
                        // A doc was added
                        classListRef.current.push(doc);
                    }
                }
                setClassList([...classListRef.current])
            };

            attached = changeListener as EventListener;
            originClass.addEventListener('doc', attached);
        };

        runQueryAndListen();

        // The cleanup used to be returned from `runQueryAndListen`, where React never saw
        // it: the listener stayed attached and the built classes stayed subscribed for
        // every render that changed the selector.
        return () => {
            cancelled = true;
            if (attached) originClass.removeEventListener('doc', attached);
            // Guarded: the change handler above pushes the raw document for a class it
            // has not seen before, so the list is not uniformly Class instances.
            for (const classInstance of classListRef.current) classInstance?.close?.();
            classListRef.current = [];
        };
    }, [originClass, JSON.stringify(selector)]); // Dependency on classObj and query

    return { classList, loading, error };
};

/**
 * Hook to retrieve a single Class instance by name.
 * 
 * @param stack - The name of the stack.
 * @param className - The name of the class to retrieve.
 * @returns Object containing the Class instance, loading state, and error.
 * 
 * @example
 * ```tsx
 * const ClassDetails = () => {
 *     const { classObj, loading } = useClass('my-stack', 'User');
 *     
 *     if (loading) return <div>Loading...</div>;
 *     if (!classObj) return <div>Class not found</div>;
 *     
 *     return <div>Class Description: {classObj.description}</div>;
 * };
 * ```
 */
export const useClass = (stack: string, className: string) => {
    const docStack = useContext(DocStackContext);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState();
    const [classObj, setClass] = useState<Class>();
    const reqRef = useRef(false);

    useEffect( () => {
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            console.error('useClass must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }

        const fetchClass = async () => {
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const res = await stackInstance.getClass(className);
                    // TODO: manage class model (schema!) updates
                    if (res) {
                        setClass(res);
                    }
                }
                
            } catch (e: any) {
                setError(e);
            } finally {
                setLoading(false)
            }
        }

        if (!reqRef.current) {
            reqRef.current = true;
            setLoading(true);
            fetchClass()
        }

        return () => {
            // reqRef.current = false;
        }

    }, [docStack, stack, className]);

    return {loading, error, classObj}
}


/**
 * Hook to retrieve documents (cards) of a specific class.
 * Maintains a real-time list of documents matching the query.
 * 
 * @param stack - The name of the stack.
 * @param className - The class name to fetch documents for.
 * @param query - Optional Mango selector to filter documents.
 * @returns Object containing the list of documents, loading state, and error.
 * 
 * @example
 * ```tsx
 * const UserList = () => {
 *     const { docs, loading } = useClassDocs('my-stack', 'User', {
 *         age: { $gt: 18 }
 *     });
 *     
 *     if (loading) return <div>Loading...</div>;
 *     
 *     return (
 *         <ul>
 *             {docs.map(doc => <li key={doc._id}>{doc.name}</li>)}
 *         </ul>
 *     );
 * };
 * ```
 */
export const useClassDocs = (stack: string, className: string, query = {}) => {
    const docStack = useContext(DocStackContext);

    const [classObj, setClass] = useState<Class>();
    const [docs, setDocs] = useState<Document[]>([]);
    const docsRef = useRef<Document[]>([]);

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
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const retrievedClass = await stackInstance.getClass(className);
                    if (retrievedClass) {
                        setClass(retrievedClass);
                    }
                }
                
            } catch (err: any) {
                setError(err);
                setLoading(false);
            }
        };

        fetchClass();

        return () => {
            // clean what?
        };
    }, [docStack, stack, className]); // Dependency on docStack and className

    useEffect(() => {
        if (!classObj) {
            return;
        }

        let cancelled = false;
        let attached: EventListener | null = null;

        const runQueryAndListen = async () => {
            setLoading(true);
            try {
                // debugger;
                const initialDocs = await classObj.getCards(query) as Document[];
                if (cancelled) return;
                docsRef.current = initialDocs;
                setDocs(docsRef.current);
            } catch (err: any) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
            if (cancelled) return;

            const changeListener = (change: CustomEvent) => {
                const doc = change.detail.doc;
                console.log("useClassDocs - detail", {detail: change.detail});
                if (!doc.active) {
                    // A doc was deleted
                    console.log("useClassDocs - a doc was deleted", {doc});
                    const docIndex = docsRef.current.findIndex((d) => d._id == doc._id)
                    if (docIndex != -1) {
                        docsRef.current = [
                            ...docsRef.current.slice(0, docIndex),
                            ...docsRef.current.slice(docIndex+1, docsRef.current.length)
                        ];
                    }
                } else {
                    // A doc was changed or added
                    console.log("useClassDocs - a doc was changed or added", {doc});
                    const docIndex = docsRef.current.findIndex((d) => d._id == doc._id)
                    if (docIndex != -1) {
                        // A doc was changed
                        console.log("useClassDocs - a doc was changed", {doc});
                        docsRef.current = [
                            ...docsRef.current.slice(0, docIndex),
                            doc,
                            ...docsRef.current.slice(docIndex+1, docsRef.current.length)
                        ];
                    } else {
                        // A doc was added
                        console.log("useClassDocs - a doc was added", {doc});
                        docsRef.current.push(doc);
                    }
                }
                setDocs([...docsRef.current])
            };

            attached = changeListener as EventListener;
            classObj.addEventListener('doc', attached);
        };

        runQueryAndListen();

        // The cleanup used to be returned from `runQueryAndListen`, so React never
        // received it and each query change left another listener on the class.
        return () => {
            cancelled = true;
            if (attached) classObj.removeEventListener('doc', attached);
        };
    }, [classObj, JSON.stringify(query)]); // Dependency on classObj and query

    return { docs, loading, error };
};