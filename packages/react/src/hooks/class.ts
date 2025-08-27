import React from "react";
import { DocStackContext } from "../components/StackProvider";
import { Class } from "@docstack/client";

export const useClassList = () => {
    const docStack = React.useContext(DocStackContext);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [error, setError] = React.useState();
    const [classList, setClassList] = React.useState<Class[]>([]);
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