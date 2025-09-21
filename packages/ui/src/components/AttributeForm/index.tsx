import React, { ReactElement, ReactNode } from "react";
import { AttributeModel, AttributeType, Class } from "@docstack/shared";
import { Form, NumberInput, Select, TextInput, Toggle } from "@prismal/react";
import { Attribute } from "@docstack/client";


export interface ExistingAttrConfigFormProps {
    classObj?: Class;
    closeModal?: () => void;
    model: AttributeModel,
    mode?: "read" | "write";
}
export const ExistingAttrConfigForm: React.FC<ExistingAttrConfigFormProps> = (props) => {
    const {
        classObj,
        closeModal,
        model,
        mode = "read"
    } = props;

    const {name, type, description, config} = model;

    const fields = React.useMemo(() => {
        const fields_: JSX.Element[] = [
            <TextInput key="description" disabled={mode === "read"} value={description} name="description" label="Description" />
        ];
        const spec = Object.entries(config).map((e, i) => {
            switch (e[0]) {
                case "encrypted":
                    return <Toggle key={"encrypted"} disabled={mode == "read"} name="encrypted" checked={e[1]} label="Encrypted" />;
                case "mandatory":
                    return <Toggle key={"mandatory"} disabled={mode == "read"} name="mandatory" checked={e[1]} label="Mandatory" />;
                case "primaryKey":
                    return <Toggle key={"primaryKey"} disabled={mode == "read"} name="primaryKey" checked={e[1]} label="Primary key" />;
                case "maxLength":
                    return <NumberInput key={"maxLength"} disabled={mode == "read"} name="maxLength" value={e[1]} label="Max length" />;
                case "max":
                    return <NumberInput key={"max"} disabled={mode == "read"} name="max" value={e[1]} label="Max" />;
                case "min":
                    return <NumberInput key={"min"} disabled={mode == "read"} name="min" value={e[1]} label="Min" />;
                case "precision":
                    return <NumberInput key={"precision"} disabled={mode == "read"} name="min" value={e[1]} label="Precision" />;
                default:
                    return <></>
            }
        });
        fields_.push(...spec);
        return fields_;
    }, [config, mode]);

    const updateAttr = React.useCallback((data: {[key: string]: any}) => {
        if (classObj) {
            console.log("updateAttr", data);
            const description = data.description;
            delete data.description;
            const newAttribute = new Attribute(classObj, name, type, description, {...data});
            classObj.modifyAttribute(name, newAttribute).then(res => {

            }).finally(() => {
                if (closeModal) closeModal();
            });
        }
    }, [closeModal,mode, name, type, classObj]);

    return <Form style={{flex: 1}} onSubmit={mode === "write" ? updateAttr : undefined}>
        {fields}
    </Form>
}

const getConfigFields = (type?: AttributeType["type"]) => {
    const fields: JSX.Element[] = [];

    fields.push(
        <TextInput gridPlacement={"1"} key="name" id="name" name="name" 
            label="Name" required placeholder="Attribute name"
        />
    );

    fields.push(
        <TextInput gridPlacement={"1"} key="description" id="description" name="description" 
            label="Description" required placeholder="Explain what it represent"
        />
    );

    fields.push(<Toggle gridPlacement={"2"} key="mandatory" id="mandatory" name="mandatory" checked={false} label="Mandatory" />);
    fields.push(<Toggle gridPlacement={"2"} key="primaryKey" id="primaryKey" name="primaryKey" checked={false} label="Primary key" />);
    fields.push(<Toggle gridPlacement={"2"} key="isArray" id="isArray" name="isArray" checked={false} label="Array" />);

    switch(type) {
        case "string":
            fields.push(<NumberInput gridPlacement={"3"} key="maxLength" name="maxLength" id="maxLength" value={50} label="Max length." />);
            fields.push(<NumberInput gridPlacement={"3"} key="encrypted" name="encrypted" id="encrypted" value={50} label="Encrypted" />);
            fields.push(<TextInput gridPlacement={"3"} key="defaultValue" name="defaultValue" id="defaultValue" placeholder="" label="Default value" />);
        break;
        case "boolean":
            fields.push(<Toggle gridPlacement={"3"} key="defaultValue" name="defaultValue" id="defaultValue" checked={false} label="Default value" />);
        break;
        case "integer":
            fields.push(<NumberInput gridPlacement={"3"} key="max" name="max" id="max" label="Max value" />);
            fields.push(<NumberInput gridPlacement={"3"} key="min" name="min" id="maxLength" label="Min value" />);
            fields.push(<NumberInput gridPlacement={"3"} key="defaultValue" name="defaultValue" id="defaultValue" label="Default value" />);
        break;
        case "decimal":
            fields.push(<NumberInput gridPlacement={"3"} key="max" name="max" id="max" label="Max value" />);
            fields.push(<NumberInput gridPlacement={"3"} key="min" name="min" id="maxLength" label="Min value" />);
            fields.push(<NumberInput gridPlacement={"3"} key="defaultValue" name="defaultValue" id="defaultValue" label="Default value" />);
        break;
        default: <></>
        break;
    }
    return fields;
}

const useFields = () => {
    const [attrType, setAttrType] = React.useState<AttributeType["type"] | undefined>();

    const onTypeChange = React.useCallback((value: string | string[]) => {
        const value_ = value as AttributeType["type"];
        if (value_) setAttrType(value_);
        else setAttrType(undefined);
    }, []);
    
    const fields = React.useMemo( () => getConfigFields(attrType), [attrType]);

    return [
        <Select gridPlacement={"1"} required name="type" id="type" options={[
            { value: "string", element: "String" },
            { value: "boolean", element: "Boolean" },
            { value: "integer", element: "Integer" },
            { value: "decimal", element: "Decimal" },
            { value: "foreign_key", element: "Foreign key"}
        ]} placeholder={"Choose"} label="Attribute type" onChange={onTypeChange}/>,
        ...fields
    ]
    
}

interface AttributeFormProps {
    classObj: Class;
    closeModal?: () => void;
}
const AttributeForm: React.FC<AttributeFormProps> = (props) => {
    const {
        classObj,
        closeModal
    } = props;

    const [isLoading, markLoading] = React.useState(false);
    
    const fields = useFields();

    const createAttribute = React.useCallback((data: {[key: string]: any}) => {
        const config: AttributeType["config"] = {};
        if (data.mandatory) config.mandatory = data.mandatory;
        if (data.primaryKey) config.primaryKey = data.primaryKey;
        if (data.isArray) config.isArray = data.isArray;
        if (data.defaultValue) config.defaultValue = data.defaultValue;
        if (data.encrypted) config.encrypted = data.encrypted;
        if (data.format) config.format = data.format;
        if (data.maxLength) config.maxLength = data.maxLength;
        if (data.max) config.max = data.max;
        if (data.min) config.min = data.min;
        if (data.precision) config.precision = data.precision;
        if (data.targetClass) config.targetClass = data.targetClass;
        const attribute = new Attribute(classObj, data.name, data.type, data.description, config);
        classObj.addAttribute(attribute).then((result) => {
            console.log("createAttribute - Result", {result})
        }).finally(() => {
            markLoading(false);
            if (closeModal) closeModal();
        });
        // set loading state
        markLoading(true);
    }, [closeModal, classObj]);

    return <Form
        gridGap={"1rem 0.5rem"}
        gridTemplate={{cols: "1fr 1fr 1fr"}}
        onSubmit={createAttribute}
    >
        {fields}
    </Form>
}

export default AttributeForm;