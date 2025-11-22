import { useContext, useCallback, useEffect, useRef, useState } from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";
import {Document,  Domain,  DomainModel,  RelationDocument,  SelectAST, UnionAST} from "@docstack/shared";

export const useDomainCreate = (stack: string) => {
    const docStack = useContext(DocStackContext);

    return useCallback(
        async (domainName: string, cardinality: "1:1" | "1:N" | "N:1" | "N:N", sourceClass: Class, targetClass: Class, domainDesc?: string) => {
            try {
                if (!docStack) {
                    // Handle the case where the provider is not yet initialized or missing
                    // You could throw an error or return an empty state.
                    console.error('useDomainCreate must be used within a DocStackProvider.');
                    // setLoading(false);
                    return Promise.resolve(null);
                }
                // Run the initial query
                const stackInstance = docStack.getStack(stack);
                if (stackInstance) {
                    const domain = await Domain.create(stackInstance, null, domainName, "domain", cardinality, sourceClass, targetClass, domainDesc);
                    return domain;
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

export const useDomainList = (stack: string, selector: {[key: string]: any}) => {
    const docStack = useContext(DocStackContext);

    const [originClass, setOriginClass] = useState<Class>();
    const [domainList, setDomainList] = useState<Domain[]>([]);
    const domainListRef = useRef<Domain[]>([]);

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
                    const retrievedClass = await stackInstance.getClass('domain');
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
                const stackInstance = docStack!.getStack(stack)!;
                const initialDomainModelList = await originClass.getCards(selector) as DomainModel[];
                const initDomainList = await Promise.all(initialDomainModelList.map(async (dm) => await Domain.buildFromModel(stackInstance, dm)));
                
                domainListRef.current = initDomainList;
                setDomainList(domainListRef.current);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

            const changeListener = (change: CustomEvent) => {
                const doc = change.detail.doc;
                if (!doc.active) {
                    // A doc was deleted
                    const docIndex = domainListRef.current.findIndex((d) => d.id == doc._id)
                    if (docIndex != -1) {
                        domainListRef.current = [
                            ...domainListRef.current.slice(0, docIndex),
                            ...domainListRef.current.slice(docIndex+1, domainListRef.current.length)
                        ];
                    }
                } else {
                    // A doc was changed or added
                    const docIndex = domainListRef.current.findIndex((d) => d.id == doc._id)
                    if (docIndex != -1) {
                        // A doc was changed
                        domainListRef.current = [
                            ...domainListRef.current.slice(0, docIndex),
                            doc,
                            ...domainListRef.current.slice(docIndex+1, domainListRef.current.length)
                        ];
                    } else {
                        // A doc was added
                        domainListRef.current.push(doc);
                    }
                }
                setDomainList([...domainListRef.current])
            };

            originClass.addEventListener('doc', changeListener as EventListener);

            return () => {
                originClass.removeEventListener('doc', changeListener as EventListener);
            };
        };

        runQueryAndListen();
    }, [originClass, JSON.stringify(selector)]); // Dependency on classObj and query

    return { domainList, loading, error };
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
    const [docs, setDocs] = useState<RelationDocument[]>([]);
    const docsRef = useRef<RelationDocument[]>([]);

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
                const initialDocs = await domain.getRelations(query);
                docsRef.current = initialDocs;
                setDocs(docsRef.current);
            } catch (err: any) {
                setError(err);
            } finally {
                setLoading(false);
            }

            const changeListener = (change: CustomEvent) => {
                const doc = change.detail.doc;
                if (!doc.active) {
                    // A doc was deleted
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