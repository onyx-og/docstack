import React from "react";
import { AttributeType } from "@docstack/shared";
import { Form, NumberInput, Select, TextInput, Toggle } from "@prismal/react";

const getConfigFields = (type?: AttributeType["type"]) => {
    const fields = [];

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
        default:
        break;
    }
    return fields;
}

interface AttributeFormProps {
    closeModal?: () => void;
}
const AttributeForm: React.FC<AttributeFormProps> = (props) => {
    const {
        closeModal
    } = props;

    const [attrType, setAttrType] = React.useState<AttributeType["type"] | undefined>();

    const onTypeChange = React.useCallback((value: string | string[]) => {
        const value_ = value as AttributeType["type"];
        if (value_) setAttrType(value_);
        else setAttrType(undefined);
    }, []);

    const fields = React.useMemo( () => getConfigFields(attrType), [attrType]);

    const createAttribute = React.useCallback((data: {}) => {
        console.log("Create attribute from data", {data});
        if (closeModal) closeModal();
    }, [closeModal]);

    return <Form
        gridGap={"1rem 0.5rem"}
        gridTemplate={{cols: "1fr 1fr 1fr"}}
        onSubmit={createAttribute}
    >
        <Select required name="type" id="attrType" options={[
            { value: "string", element: "String" },
            { value: "boolean", element: "Boolean" },
            { value: "integer", element: "Integer" },
            { value: "decimal", element: "Decimal" },
            { value: "foreign_key", element: "Foreign key"}
        ]} placeholder={"Choose"} label="Attribute type" onChange={onTypeChange}/>
        {fields}
    </Form>
}

export default AttributeForm;