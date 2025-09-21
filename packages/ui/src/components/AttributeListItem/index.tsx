import { AttributeModel, Class } from "@docstack/shared";
import { Card, Accordion, ActionBar, Button, Form, Toggle, useModal, NumberInput, Select } from "@prismal/react";
import React from "react";
import { ExistingAttrConfigForm } from "../AttributeForm";
import "./index.scss";

interface AttributeListItemProps {
    model: AttributeModel;
    classObj: Class;
}
const AttributeListItem = (props: AttributeListItemProps) => {
    const {classObj, model} = props; 
    const {
        name,
        type,
        config
    } = React.useMemo( () => model, [model]);

    const [mode, setMode] = React.useState<"read" | "write">("read");

    const toggleMode = React.useCallback((value: string) => {
        if (["read", "write"].includes(value)) {
            setMode(value as ("read"| "write"));
        }
    },[setMode]);

    const { Modal: EditModal, open: openEditModal, close: closeEditModal } = useModal({areaId: "root"});
    const { Modal: DeleteModal, open: openDelModal, close: closeDelModal } = useModal({areaId: "root"});

    const confirmDeleteAttr = React.useCallback(() => {
        console.log(`Deleting attribute '${name}'`);
        classObj.removeAttribute(name).then(res => {
            console.log("delete attribute result in new classObj", {classObj})
            closeDelModal();
        });
        
    }, [classObj, name]);

    return <Card className="list-item-attribute">
        <EditModal title={`Attribute: ${name}`} footer={<ActionBar items={[
            { position: "right", key: "btn-del-attr", item: <Button type="default" onClick={closeEditModal} iconName="close">Cancel</Button> },
            { item: <Select placeholder={"Mode"} options={[
                {value: "read", element: "View", selected: mode == "read"},
                {value: "write", element: "Edit", selected: mode != "read"}
            ]} onChange={(v) => toggleMode(v as string)}  />, position: "left", key: "mode-selector" },
            { position: "left", key: "btn-cancel-edit-attr", item: <Button type="primary" onClick={openDelModal} accent="#f5474c" iconName="trash">Delete</Button> }
        ]}/>}>
            <ExistingAttrConfigForm classObj={classObj} closeModal={closeEditModal} mode={mode} model={model} />
        </EditModal>
        <DeleteModal title="Confirmation" footer={<ActionBar items={[
            { position: "right", key: 'btn-cancel-del', item: <Button onClick={closeDelModal} type="primary" iconName="close">Cancel</Button> },
            { position: "right", key: 'btn-confirm-del', item: <Button onClick={confirmDeleteAttr} iconName="check">Confirm</Button> },
        ]}/>}>
            Do you wish to delete this attribute?
        </DeleteModal>
        <Accordion header={<ActionBar
            items={[
                { position: 'left', key: 'label-attr', item: <span>{name}</span> },
                { position: "right", key: "btn-edit-attr", item: <Button onClick={openEditModal} className="btn-edit-attr" iconName="external-link" type="primary" /> },
                { position: "right", key: "btn-del-attr", item: <Button onClick={openDelModal} accent="#f5474c" className="btn-del-attr" iconName="trash" type="text" /> },
            ]}
        />}>
            <span>{type}</span>
            <ExistingAttrConfigForm model={model} />
        </Accordion>
    </Card>
}

export default AttributeListItem;