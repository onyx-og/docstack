import { AttributeModel, ClassModel, Document } from "@docstack/shared";
import { Button, Form, TextInput, Toggle, InputRefType } from "@prismal/react";
import { useClass } from "@docstack/react";
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
    model: ClassModel;
    doc?: Document;
    mode?: "read" | "write" | "read/write";
    onSubmission?: (arg?: any) => void;
}
const DocumentForm: React.FC<DocumentFormProps> = (props) => {
    const {
        model,
        mode,
        doc,
        onSubmission
    } = props;

    const { schema = [], name } = model;

    console.log("DocumentForm", {doc});

    // [TODO] Add loading indicator on submit button
    const { loading, error, classObj } = useClass(name);
    
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
        for (const attrModel of schema) {
            fields.push(<AttributeField 
                defaultMode={mode != "read/write" ? mode : "write"} 
                allowToggleMode={mode=="read/write"} {...attrModel} 
                value={doc?.[attrModel.name]}
                key={attrModel.name}
            />);
        }
        return fields;
    }, [schema, doc, mode]);

    return <Form className="form-class-doc"
        // submit={}
        onSubmit={submitDoc}>
        {attributeFields}
    </Form>
}

export default DocumentForm;