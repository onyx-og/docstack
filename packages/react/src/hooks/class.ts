import React from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";
import {Document} from "@docstack/shared";

export const useClassList = () => {
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
                const classList = await docStack.getStore().getAllClasses();
                if (classList.length) {
                    setClassList(classList);
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

    }, [docStack]);

    return { loading, classList, error };
}

export const useClass = (className: string) => {
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
                const res = await docStack.getStore().getClass(className);
                if (res) {
                    setClass(res);
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

    }, [docStack, className]);

    return {loading, error, classObj}
}


export const useClassDocs = (className: string, query = {}) => {
    const docStack = React.useContext(DocStackContext);

    const [classObj, setClass] = React.useState<Class>();
    const [docs, setDocs] = React.useState<Document[]>([]);

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
                const stackInstance = docStack.getStore();
                const retrievedClass = await stackInstance.getClass(className);
                if (retrievedClass) {
                    setClass(retrievedClass);
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
    }, [docStack, className]); // Dependency on docStack and className

    React.useEffect(() => {
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