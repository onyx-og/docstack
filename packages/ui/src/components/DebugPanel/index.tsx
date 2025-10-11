import { useCallback, useContext, useState, useEffect, } from "react";
import { DocStackContext } from "@docstack/react";
import { ActionBar, Button } from "@prismal/react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "hooks";

// Define the component's props
interface JsonExportButtonProps {
    /** The JavaScript object to be exported. */
    jsonData: object | null;
    /** The desired name for the downloaded file. */
    fileName: string;
    /** The label for the button. */
    buttonLabel: string;
}

/**
 * A button component that asynchronously prepares a Blob URL for JSON data.
 */
const JsonExportButton: React.FC<JsonExportButtonProps> = ({
    jsonData,
    fileName,
    buttonLabel
}) => {
    // State to hold the temporary Blob URL
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    // State to manage the loading/preparation process
    const [isLoading, setIsLoading] = useState(true);

    // 1. Logic to create the Blob URL is put into a useCallback for stability
    const generateBlobUrl = useCallback(() => {
        setIsLoading(true);
        // Note: This process is typically fast enough to be synchronous, 
        // but we treat it as an operation that needs to complete before the button is active.
        try {
            const jsonString = JSON.stringify(jsonData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });

            const url = URL.createObjectURL(blob);
            setBlobUrl(url); // Store the generated URL in state

        } catch (error) {
            console.error("Error generating JSON Blob:", error);
            setBlobUrl(null);
        } finally {
            setIsLoading(false);
        }
    }, [jsonData]); // Re-run if the JSON data itself changes

    // 2. Use useEffect to run the generation logic when the component mounts 
    // or when the input data changes.
    useEffect(() => {
        if (jsonData) generateBlobUrl();

        // 3. Cleanup function: This is CRUCIAL to prevent memory leaks!
        // It revokes the URL when the component unmounts or before the effect re-runs.
        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
            }
        };
    }, [jsonData, generateBlobUrl]); // Depend on jsonData and the memoized function

    // 4. Render the button using the state variables
    return (

        <Button
            // The button is disabled if we are loading OR if the URL is somehow null
            disabled={isLoading || !blobUrl}
            onClick={(e) => {
                if (!blobUrl) {
                    // Prevent navigation if the URL is not ready
                    e.preventDefault();
                }
                // The browser handles the download due to href and download attributes
            }}
        >
            <a
                href={blobUrl || '#'} // Set the href to the generated URL or '#' if not ready
                download={`${fileName}-${new Date().getUTCMilliseconds()}`} // Tell the browser to download it with this name
                role="button" // Use role="button" for accessibility if it looks like a button
                style={{ textDecoration: 'none' }} // Style the <a> tag as a button
            >{isLoading ? 'Preparing File...' : buttonLabel} </a>
        </Button>

    );
};

const DebugPanel = () => {
    const docStack = useContext(DocStackContext);
    const navigate = useNavigate();
    const stackName = useAppSelector(s => s.stack.name);

    const reset = useCallback(() => {
        if (!docStack) {
            throw new Error("reset must be used whithin DockStackProvider");
        }
        docStack.reset();
        navigate('/')
        navigate(0);
    }, []);

    const [dumpData, setDumpData] = useState<object | null>(null);

    const createDump = useCallback(async () => {
        if (!docStack) {
            throw new Error("Create dump must be used whithin DockStackProvider");
        }
        const res = await docStack.export(stackName);
        setDumpData(res);

    }, [stackName]);

    const restoreDump = useCallback(async () => {
        if (!docStack) {
            throw new Error("Restore dump must be used whithin DockStackProvider");
        }
        // const res = await docStack.restore(stackName, dump);
    }, [stackName]);

    return <div>
        <ActionBar items={[
            {item: <Button type="primary" onClick={restoreDump}>Restore</Button>, key: "restore", position: "left"},
            {item: <Button type="primary" onClick={reset}>Reset</Button>, key: "reset", position: "left"},
            {item: <Button type="primary" onClick={createDump}>Create Dump</Button>, key: "dump", position: "left"},
            {item: <JsonExportButton fileName="dump" buttonLabel="Download" jsonData={dumpData} />, key: "export", position: "left"}
        ]} />
    </div>
}

export default DebugPanel;