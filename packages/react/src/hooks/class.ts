import React from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";
import {Document} from "@docstack/shared";

export const useClassCreate = (stack: string) => {
    const docStack = React.useContext(DocStackContext);

    return React.useCallback(
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

export const useClassList = (stack: string) => {
    const docStack = React.useContext(DocStackContext);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [error, setError] = React.useState();
    const [classList, setClassList] = React.useState<Class[]>([]);
    // [TODO] Solve bounce of component because of React.StrictMode or other reasons
    const queryRef = React.useRef(false);

    React.useEffect( () => {
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            console.error('useClassList must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }


        const fetchClasses = async () => {
            try {
                // Run the initial query
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const classList = await stackInstance.getAllClasses();
                    // TODO: setup listener for class add/delete
                    if (classList.length) {
                        setClassList(classList);
                    }
                }
                
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }
        }
        if (!queryRef.current) {
            queryRef.current = true;
            setLoading(true);
            fetchClasses();
        } else {
            console.log("Already performing query");
        }
        

        return () => {
            setClassList([]);
            // queryRef.current = false;
        }

    }, [docStack, stack]);

    return { loading, classList, error };
}

export const useClass = (stack: string, className: string) => {
    const docStack = React.useContext(DocStackContext);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [error, setError] = React.useState();
    const [classObj, setClass] = React.useState<Class>();
    const reqRef = React.useRef(false);

    React.useEffect( () => {
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
    const docStack = React.useContext(DocStackContext);

    const [classObj, setClass] = React.useState<Class>();
    const [docs, setDocs] = React.useState<Document[]>([]);
    const docsRef = React.useRef<Document[]>([]);

    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    

    React.useEffect(() => {
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

    React.useEffect(() => {
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