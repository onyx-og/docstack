import { Form, Select, TextInput } from "@prismal/react";
import React from "react";
// import * as monaco from "monaco-editor";
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';

interface TriggerFormProps {
    closeModal?: () => void;
}
const TriggerForm: React.FC<TriggerFormProps> = (props) => {
    const { closeModal } = props;
    const [editorMountPointSet, markEditorMountPointSet] = React.useState(false);
    const editorMountPoint = React.useRef<HTMLDivElement>();

    const editor = React.useRef<monaco.editor.IStandaloneCodeEditor>();

    const setEditorMountPoint = React.useCallback((node: HTMLDivElement) => {
        if (editorMountPoint.current) {
            return;
        }
        if (node) {
            editorMountPoint.current = node;
            markEditorMountPointSet(true);
        }
    }, []);

    const createTrigger = React.useCallback((data: {}) => {
        const content = editor.current?.getValue();
        console.log("Create trigger", { data, content });
        if (closeModal) closeModal();
    }, []);

    const validateName = React.useCallback((value: any) => {
        const reg = new RegExp(/^[A-Za-z]*$/gm);
        if (!reg.test(value)) {
            return "Must be without spaces, no special characters and cannot start with a number."
        } else return true
    }, []);

    React.useEffect(() => {
        if (editorMountPointSet && editorMountPoint.current) {
            editor.current = monaco.editor.create(editorMountPoint.current, {
                value: `document["startDate"] = Date.now();\nreturn document;`,
                language: "javascript",
                automaticLayout: true,
            })
        }
    }, [editorMountPointSet]);

    return <>
        <Form
            gridGap={"1rem 0.5rem"}
            gridTemplate={{ cols: "1fr" }}
            onSubmit={createTrigger}
        >
            <TextInput gridPlacement={{ row: "1" }} required name="name" id="name" validator={validateName} placeholder="AutoProperty" label="Name" />
            <Select gridPlacement={{ row: "2" }} required name="order" id="order" options={[
                { value: "before", element: "BEFORE", selected: true },
                { value: "after", element: "AFTER" },
            ]} label="Execution order" />
        </Form>
        <div style={{
            minWidth: '30rem',
            minHeight: '10rem'
        }} ref={setEditorMountPoint}></div>
    </>
}

export default TriggerForm;