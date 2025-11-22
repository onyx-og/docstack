import { useContext, useCallback, useEffect, useRef, useState } from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";
import {ClassModel, Document} from "@docstack/shared";

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
                classListRef.current = initialClassList;
                setClassList(classListRef.current);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

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

            originClass.addEventListener('doc', changeListener as EventListener);

            return () => {
                originClass.removeEventListener('doc', changeListener as EventListener);
            };
        };

        runQueryAndListen();
    }, [originClass, JSON.stringify(selector)]); // Dependency on classObj and query

    return { classList, loading, error };
};

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

        const runQueryAndListen = async () => {
            setLoading(true);
            try {
                const initialDocs = await classObj.getCards(query) as Document[];
                docsRef.current = initialDocs;
                setDocs(docsRef.current);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

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

            classObj.addEventListener('doc', changeListener as EventListener);

            return () => {
                classObj.removeEventListener('doc', changeListener as EventListener);
            };
        };

        runQueryAndListen();
    }, [classObj, JSON.stringify(query)]); // Dependency on classObj and query

    return { docs, loading, error };
};