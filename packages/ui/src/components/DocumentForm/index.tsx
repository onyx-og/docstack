import { AttributeModel, ClassModel, Document } from "@docstack/shared";
import { Button, Form, TextInput, Toggle, InputRefType, ActionBar, ActionBarItemConfig, Select, useModal, NumberInput } from "@prismal/react";
import { useClass } from "@docstack/react";
import React from "react";
import { useAppSelector } from "hooks";

interface AttributeFieldProps extends AttributeModel {
    value?: any;
    defaultMode?: "read" | "write";
    allowToggleMode?: boolean;
}
const AttributeField = React.forwardRef((props: AttributeFieldProps, ref: React.ForwardedRef<InputRefType>) => {
    const {
        name,
        type,
        config,
        value,
        defaultMode = "read",
        allowToggleMode = false
    } = props;

    // [TODO] Manage config value for validation or diverse input
    // [TODO] Manage read-only
    const [ mode, setMode ] = React.useState<string>(defaultMode);

    const toggleMode = React.useCallback(() => {
        if (mode == "read") setMode("write");
        else setMode("read");
    }, [mode]);

    const modeBtn = React.useMemo(() => {
        if (allowToggleMode) {
            return <Button onClick={toggleMode} iconName={ mode == "write" ? "eye" : "pencil"} type="text" />
        }
    }, [mode, allowToggleMode]);

    switch (type) {
        case "string":
            return <TextInput required={config.mandatory} ref={ref} key={name} after={modeBtn} type="default" htmlType="text" disabled={mode=="read"} name={name} label={name} value={value} />
        case "boolean":
            return <Toggle type="switch" name={name} label={name} checked={value} />
        case "integer":
            return <NumberInput name={name} label={name} value={value} step={1} />
         case "decimal":
            return <NumberInput name={name} label={name} value={value} step={1} />
        default:
            throw new Error(`Unexpected attribute field type '${type}'`);
    }
});

interface DocumentFormProps {
    model: ClassModel;
    doc?: Document;
    mode?: "read" | "write" | "read/write";
    onSubmission?: (arg?: any) => void;
}
const DocumentForm: React.FC<DocumentFormProps> = (props) => {
    const {
        model,
        mode: initMode = "read",
        doc,
        onSubmission
    } = props;

    const { schema = [], name } = model;
    const [mode, setMode] = React.useState(initMode);
    const stackName = useAppSelector(s => s.stack.name);

    const toggleMode = React.useCallback((value: string) => {
        if (["read", "read/write"].includes(value)) {
            setMode(value as "read" | "read/write");
        }
    }, []);

    const { Modal, open: openConfirmDel, close: closeConfirmDel } = useModal({areaId: "root"});

    // [TODO] Add loading indicator on submit button
    const { loading, error, classObj } = useClass(stackName, model.name);
    
    const submitDoc = React.useCallback((formData: {}) => {
        if (classObj) {
            // Perform create/update
            console.log(`submitDoc - id: ${doc?._id}`);
            classObj.addOrUpdateCard(formData, doc?._id);
        } else {
            // disabled submit button on loading/error
        }
        if (onSubmission) onSubmission(formData);
    }, [doc, classObj, onSubmission]);


    const attributeFields = React.useMemo(() => {
        let fields = [];
        for (const attrModel of Object.values(schema)) {
            fields.push(<AttributeField 
                defaultMode={mode != "read/write" ? mode : "write"} 
                allowToggleMode={mode=="read/write"} {...attrModel} 
                value={doc?.[attrModel.name]}
                key={attrModel.name}
            />);
        }
        return fields;
    }, [schema, doc, mode]);

    const deleteDoc = React.useCallback(() => {
        if (classObj && doc) {
            classObj.deleteCard(doc._id).then((res) => {
                if (res && onSubmission) onSubmission({deleted: true})
            });
        } else if (!classObj) {
            throw new Error("Missing class instance. Check logs");
        } else {
            throw new Error("Missing document to delete");
        }
    }, [doc, classObj, onSubmission]);

    const actionBarItems = React.useMemo(() => {
        const items: ActionBarItemConfig[] = [];
        if (doc) {
            items.push({position: "left", key: "btn-doc-del", item: <Button iconName="trash" type="primary" onClick={openConfirmDel}/>});
        }
        items.push({ item: <Select placeholder={"Mode"} options={[
            {value: "read", element: "View", selected: mode == "read"},
            {value: "read/write", element: "Edit", selected: mode != "read"}
        ]} onChange={(v) => toggleMode(v as string)}  />, position: "left", key: "mode-selector" })
        return items;
    }, [doc, mode, openConfirmDel]);

    return <div>
        <Modal title="Confirmation" footer={<ActionBar items={[
            { position: "right", key: 'btn-cancel-del', item: <Button onClick={closeConfirmDel} type="primary" iconName="close">Cancel</Button> },
            { position: "right", key: 'btn-confirm-del', item: <Button onClick={deleteDoc} iconName="check">Confirm</Button> },
        ]}/>}>
            Do you wish to delete this document?
        </Modal>
        <Form className="form-class-doc"
            // submit={}
            onSubmit={submitDoc}>
            {attributeFields}
        </Form>
        <ActionBar items={actionBarItems}/>
    </div>
}

export default DocumentForm;