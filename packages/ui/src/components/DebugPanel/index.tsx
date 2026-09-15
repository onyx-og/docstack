import { useCallback, useContext, useState, useEffect, useRef } from "react";
import { DocStackContext } from "@docstack/react";
import type { DocStack } from "@docstack/client";
import type { ContentExport, ContentImportReport } from "@docstack/client";
import { ActionBar, Button } from "@prismal/react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "hooks";

interface JsonExportButtonProps {
    /** The JavaScript object to be exported. */
    jsonData: object | null;
    /** The desired name for the downloaded file. */
    fileName: string;
    /** The label for the button. */
    buttonLabel: string;
}

/**
 * A button that prepares a Blob URL for JSON data and hands it to the browser as a
 * download.
 */
const JsonExportButton: React.FC<JsonExportButtonProps> = ({ jsonData, fileName, buttonLabel }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!jsonData) {
            setBlobUrl(null);
            return;
        }
        let url: string | null = null;
        try {
            url = URL.createObjectURL(new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" }));
            setBlobUrl(url);
        } catch (error) {
            console.error("Error generating JSON Blob:", error);
            setBlobUrl(null);
        }
        // Revoked when the data changes or the button unmounts: a Blob URL is a leak otherwise.
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [jsonData]);

    return (
        <Button disabled={!blobUrl} onClick={(e) => { if (!blobUrl) e.preventDefault(); }}>
            <a
                href={blobUrl || "#"}
                download={`${fileName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`}
                role="button"
                style={{ textDecoration: "none" }}
            >{blobUrl ? buttonLabel : "Nothing to download yet"}</a>
        </Button>
    );
};

const describeReport = (report: ContentImportReport): string => {
    const parts = [
        `${report.documents.written} document${report.documents.written === 1 ? "" : "s"} written`,
        `${report.relations.written} relation${report.relations.written === 1 ? "" : "s"} written`,
    ];
    const skipped = report.documents.skipped + report.relations.skipped;
    if (skipped) parts.push(`${skipped} skipped`);
    if (report.issues.length) parts.push(`${report.issues.length} issue${report.issues.length === 1 ? "" : "s"}: ${report.issues.slice(0, 3).map((issue) => `${issue.docId} (${issue.kind})`).join(", ")}${report.issues.length > 3 ? ", …" : ""}`);
    return `Restored: ${parts.join(", ")}.`;
};

/**
 * The debug panel: export the open stack's content, restore an export into it, or
 * wipe it and start over.
 *
 * Export and restore use the engine's content transfer (`exportContent` /
 * `importContent`): application content without the data model, decrypted on the
 * way out, validated against the classes the stack already has on the way in. Reset
 * destroys this stack's database only and reloads, so the provider opens it fresh
 * and re-applies its patches.
 */
interface DebugPanelProps {
    /**
     * The instance, handed in by the header that opens the panel. The modal mounts its
     * content outside the provider's tree, so the context alone reads `null` there.
     */
    docStack?: DocStack | null;
}

const DebugPanel = ({ docStack: provided }: DebugPanelProps = {}) => {
    const fromContext = useContext(DocStackContext);
    const docStack = provided ?? fromContext;
    const navigate = useNavigate();
    const stackName = useAppSelector((s) => s.stack.name);
    const fileInput = useRef<HTMLInputElement | null>(null);

    const [dumpData, setDumpData] = useState<ContentExport | null>(null);
    const [status, setStatus] = useState<string>("");
    const [busy, setBusy] = useState(false);

    // Resolved when a button is pressed, not when the panel renders: the modal may
    // render its content before the stack has finished opening.
    const resolveStack = useCallback(() => docStack?.getStack(stackName) ?? null, [docStack, stackName]);

    const reset = useCallback(async () => {
        const stack = resolveStack();
        if (!docStack || !stack) {
            setStatus("No open stack to reset.");
            return;
        }
        if (!window.confirm(`Destroy the local database of '${stackName}' and reopen it empty?`)) return;
        setBusy(true);
        try {
            await docStack.removeStack(stackName, { destroy: true });
            navigate("/");
            navigate(0);
        } catch (error: any) {
            setStatus(`Reset failed: ${error?.message ?? String(error)}`);
            setBusy(false);
        }
    }, [docStack, resolveStack, stackName, navigate]);

    const createDump = useCallback(async () => {
        const stack = resolveStack();
        if (!stack) {
            setStatus(`No open stack to export (looking for '${stackName || "?"}', ${docStack ? `${docStack.getStacks().length} open` : "no DocStack instance"}).`);
            return;
        }
        setBusy(true);
        try {
            const payload = await stack.exportContent();
            setDumpData(payload);
            const documents = Array.isArray((payload as any).documents) ? (payload as any).documents.length : 0;
            setStatus(`Export ready: ${documents} document${documents === 1 ? "" : "s"} from '${stackName}'. ${stack.isLocked() ? "The stack is locked, so encrypted attributes were not included." : ""}`.trim());
        } catch (error: any) {
            setStatus(`Export failed: ${error?.message ?? String(error)}`);
        } finally {
            setBusy(false);
        }
    }, [docStack, resolveStack, stackName]);

    const pickRestoreFile = useCallback(() => {
        if (!resolveStack()) {
            setStatus("No open stack to restore into.");
            return;
        }
        fileInput.current?.click();
    }, [resolveStack]);

    const restoreDump = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        const stack = resolveStack();
        if (!file || !stack) return;
        setBusy(true);
        try {
            const payload = JSON.parse(await file.text()) as ContentExport;
            const report = await stack.importContent(payload, { overwrite: true });
            setStatus(describeReport(report));
        } catch (error: any) {
            setStatus(`Restore failed: ${error?.message ?? String(error)}`);
        } finally {
            setBusy(false);
        }
    }, [resolveStack]);

    return <div>
        <ActionBar items={[
            { item: <Button type="primary" disabled={busy} onClick={pickRestoreFile}>Restore</Button>, key: "restore", position: "left" },
            { item: <Button type="primary" disabled={busy} onClick={reset}>Reset</Button>, key: "reset", position: "left" },
            { item: <Button type="primary" disabled={busy} onClick={createDump}>Create Dump</Button>, key: "dump", position: "left" },
            { item: <JsonExportButton fileName={`${stackName || "stack"}-export`} buttonLabel="Download export" jsonData={dumpData} />, key: "export", position: "left" },
        ]} />
        <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={restoreDump} aria-label="Export file to restore" />
        <p data-testid="debug-status" style={{ minHeight: "1.5em" }}>{status}</p>
    </div>;
};

export default DebugPanel;
