import { AttributeModel, ClassModel, Document } from "@docstack/shared";
import { Button, Form, TextInput, Toggle, InputRefType } from "@prismal/react";
import React from "react";

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
        // case "integer":
        //     return <NumberInput />
        default:
            throw new Error(`Unexpected attribute field type '${type}'`);
    }
});

interface DocumentFormProps {
    schema: AttributeModel[];
    doc?: Document;
    mode?: "read" | "write" | "read/write";
}
const DocumentForm: React.FC<DocumentFormProps> = (props) => {
    const {
        schema,
        mode,
        doc
    } = props;

    const submitDoc = React.useCallback((formData: {}) => {
        console.log("Form data", {data: formData});
        if (doc) {

        } else {
            // New document

        }
    }, [doc]);


    const attributeFields = React.useMemo(() => {
        let fields = [];
        for (const attrModel of schema) {
            fields.push(<AttributeField 
                defaultMode={mode != "read/write" ? mode : "write"} 
                allowToggleMode={mode=="read/write"} {...attrModel} 
                key={attrModel.name}
            />);
        }
        return fields;
    }, [schema, mode]);

    return <Form className="form-class-doc"
        // submit={}
        onSubmit={submitDoc}>
        {attributeFields}
    </Form>
}

export default DocumentForm;