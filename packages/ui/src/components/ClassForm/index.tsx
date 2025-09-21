import { useClassCreate } from "@docstack/react";
// import { Class } from "@docstack/shared";
import { Form, TextInput } from "@prismal/react";
import { useAppSelector } from "hooks/";
import React, { FC } from "react";

interface ClassFormProps {
    onComplete?: () => void;
}
const ClassForm:FC<ClassFormProps> = (props) => {
    const {onComplete} = props;
    const stack = useAppSelector(s => s.stack.name)

    const createClass = useClassCreate(stack);

    const onSubmit = React.useCallback((data: {[key: string]: any}) => {
        createClass(data["class-name"], data["class-desc"]).then((res) => {
            console.log("ClassForm.onSubmit - result",res)
            if (res) {
                if (onComplete) onComplete();
            }
        });
    },[stack, onComplete]);
    
    return <Form onSubmit={onSubmit}>
        <TextInput name="class-name" id="class-name" key="class-name" placeholder="Movies" label="Name" />
        <TextInput name="class-desc" id="class-desc" key="class-desc" placeholder="A collection of 90's movies" label="Description" />
    </Form>
}

export default ClassForm;