import { useDomainCreate, useClassList, DocStackContext } from "@docstack/react";
import { Form, TextInput, Select } from "@prismal/react";
import { useAppSelector } from "hooks/";
import React, { FC, useMemo, useContext } from "react";

interface DomainFormProps {
    onComplete?: () => void;
}

const DomainForm: FC<DomainFormProps> = (props) => {
    const { onComplete } = props;
    const stackName = useAppSelector(s => s.stack.name);
    const docStack = useContext(DocStackContext);

    const createDomain = useDomainCreate(stackName);
    const { classList, loading } = useClassList(stackName, {});

    const classOptions = useMemo(() => {
        return classList.map(cls => ({
            element: cls.name as string,
            value: cls.name as string
        }));
    }, [classList]);

    const cardinalityOptions = [
        { element: "1:1 (One-to-One)", value: "1:1" },
        { element: "1:N (One-to-Many)", value: "1:N" },
        { element: "N:1 (Many-to-One)", value: "N:1" },
        { element: "N:N (Many-to-Many)", value: "N:N" }
    ];

    const onSubmit = React.useCallback(async (data: { [key: string]: any }) => {
        const stack = docStack?.getStack(stackName);
        if (!stack) {
            console.error("DomainForm.onSubmit - Stack not found");
            return;
        }

        const sourceClass = await stack.getClass(data["source-class"]);
        const targetClass = await stack.getClass(data["target-class"]);

        if (!sourceClass || !targetClass) {
            console.error("DomainForm.onSubmit - Source or target class not found");
            return;
        }

        createDomain(
            data["domain-name"],
            data["cardinality"] as "1:1" | "1:N" | "N:1" | "N:N",
            sourceClass,
            targetClass,
            data["domain-desc"]
        ).then((res) => {
            console.log("DomainForm.onSubmit - result", res);
            if (res) {
                if (onComplete) onComplete();
            }
        });
    }, [stackName, docStack, createDomain, onComplete]);

    if (loading) {
        return <div>Loading classes...</div>;
    }

    return (
        <Form onSubmit={onSubmit}>
            <TextInput 
                name="domain-name" 
                id="domain-name" 
                key="domain-name" 
                placeholder="CustomerOrders" 
                label="Domain Name" 
            />
            <TextInput 
                name="domain-desc" 
                id="domain-desc" 
                key="domain-desc" 
                placeholder="Relationship between customers and their orders" 
                label="Description" 
            />
            <Select
                name="cardinality"
                id="cardinality"
                key="cardinality"
                label="Cardinality"
                options={cardinalityOptions}
            />
            <Select
                name="source-class"
                id="source-class"
                key="source-class"
                label="Source Class"
                options={classOptions}
            />
            <Select
                name="target-class"
                id="target-class"
                key="target-class"
                label="Target Class"
                options={classOptions}
            />
        </Form>
    );
}

export default DomainForm;
