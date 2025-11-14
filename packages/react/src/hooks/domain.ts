import { useContext, useCallback, useEffect, useRef, useState } from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";
import {Document,  Domain,  SelectAST, UnionAST} from "@docstack/shared";

export const useDomainList = (conf: {stack: string, filter?: string[], search?: string}) => {
    const {stack, filter, search} = conf;
    const docStack = useContext(DocStackContext);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState();
    const [classList, setDomainList] = useState<Domain[]>([]);
    // [TODO] Solve bounce of component because of StrictMode or other reasons
    const queryRef = useRef(false);

    useEffect( () => {
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            console.error('useDomainList must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }

        const changeListener = (change: CustomEvent) => {
            setDomainList([...change.detail])
        }

        const fetchDomains = async () => {
            try {
                // Run the initial query
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const domainList = await stackInstance.getDomains({filter, search});
                    setDomainList(domainList);
                    stackInstance.addEventListener("domainListChange", changeListener as EventListener)
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
            fetchDomains();
        } else {
            console.log("Already performing query");
        }
        

        return () => {
            setDomainList([]);
            const stackInstance = docStack.getStack(stack);
            if (stackInstance) 
                stackInstance.removeEventListener("domainListChange", changeListener as EventListener)
            // queryRef.current = false;
        }

    }, [docStack, stack, filter, search]);

    return { loading, classList, error };
}

export const useDomain = (stack: string, domainName: string) => {
    const docStack = useContext(DocStackContext);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState();
    const [domain, setDomain] = useState<Domain>();
    const reqRef = useRef(false);

    useEffect( () => {
        if (!docStack) {
            // Handle the case where the provider is not yet initialized or missing
            // You could throw an error or return an empty state.
            console.error('useDomain must be used within a DocStackProvider.');
            setLoading(false);
            return;
        }

        const fetchClass = async () => {
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const res = await stackInstance.getDomain(domainName);
                    // TODO: manage class model (schema!) updates
                    if (res) {
                        setDomain(res);
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

    }, [docStack, stack, domainName]);

    return {loading, error, domain}
}


export const useDomainRelations = (stack: string, domainName: string, query = {}) => {
    const docStack = useContext(DocStackContext);

    const [domain, setDomain] = useState<Domain>();
    const [docs, setDocs] = useState<Document[]>([]);
    const docsRef = useRef<Document[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    

    useEffect(() => {
        // Only run if the docStack is available and a className is provided
        if (!docStack || !domainName) {
            setLoading(false);
            return;
        }

        const fetchClass = async () => {
            setLoading(true);
            setError(null);
            try {
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const retrievedDomain = await stackInstance.getDomain(domainName);
                    if (retrievedDomain) {
                        setDomain(retrievedDomain);
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
    }, [docStack, stack, domainName]); // Dependency on docStack and className

    useEffect(() => {
        if (!domain) {
            return;
        }

        const runQueryAndListen = async () => {
            setLoading(true);
            try {
                const initialDocs = await domain.getRelations(query) as Document[];
                docsRef.current = initialDocs;
                setDocs(docsRef.current);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

            const changeListener = (change: CustomEvent) => {
                const doc = change.detail.doc;
                console.log("useDomainRelations - detail", {detail: change.detail});
                if (!doc.active) {
                    // A doc was deleted
                    console.log("useDomainRelations - a doc was deleted", {doc});
                    const docIndex = docsRef.current.findIndex((d) => d._id == doc._id)
                    if (docIndex != -1) {
                        docsRef.current = [
                            ...docsRef.current.slice(0, docIndex),
                            ...docsRef.current.slice(docIndex+1, docsRef.current.length)
                        ];
                    }
                } else {
                    // A doc was changed or added
                    console.log("useDomainRelations - a doc was changed or added", {doc});
                    const docIndex = docsRef.current.findIndex((d) => d._id == doc._id)
                    if (docIndex != -1) {
                        // A doc was changed
                        console.log("useDomainRelations - a doc was changed", {doc});
                        docsRef.current = [
                            ...docsRef.current.slice(0, docIndex),
                            doc,
                            ...docsRef.current.slice(docIndex+1, docsRef.current.length)
                        ];
                    } else {
                        // A doc was added
                        console.log("useDomainRelations - a doc was added", {doc});
                        docsRef.current.push(doc);
                    }
                }
                setDocs([...docsRef.current])
            };

            domain.addEventListener('doc', changeListener as EventListener);

            return () => {
                domain.removeEventListener('doc', changeListener as EventListener);
            };
        };

        runQueryAndListen();
    }, [domain, JSON.stringify(query)]); // Dependency on classObj and query

    return { docs, loading, error };
};