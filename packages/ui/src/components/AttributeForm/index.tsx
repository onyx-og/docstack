import React, { ReactElement, ReactNode } from "react";
import { AttributeType, Class } from "@docstack/shared";
import { Form, NumberInput, Select, TextInput, Toggle } from "@prismal/react";
import { Attribute } from "@docstack/client";

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