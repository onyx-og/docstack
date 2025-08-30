import { AttributeModel } from "@docstack/shared";
import { Card, Accordion, ActionBar, Button, Form, Toggle, useModal } from "@prismal/react";
import React from "react";

import "./index.scss";

interface ExistingAttrConfigFormProps extends AttributeModel {
    mode?: "view" | "edit";
}
const ExistingAttrConfigForm: React.FC<ExistingAttrConfigFormProps> = (props) => {
    const {
        config,
        mode = "view"
    } = props;

    const fields = React.useMemo(() => {
        return Object.entries(config).map((e, i) => {
            switch (e[0]) {
                case "encrypted":
                    return <Toggle disabled={mode == "view"} name="encrypted" checked={e[1]} label="Encrypted" />;
                case "mandatory":
                    return <Toggle disabled={mode == "view"} name="mandatory" checked={e[1]} label="Mandatory" />;
                case "primaryKey":
                    return <Toggle disabled={mode == "view"} name="primaryKey" checked={e[1]} label="Primary key" />;
                case "maxLength":
                    return <input readOnly={mode == "view"} type="number" name="maxLength" value={e[1]} />;
                case "max":
                    return <input readOnly={mode == "view"} type="number" name="max" value={e[1]} />;
                case "min":
                    return <input readOnly={mode == "view"} type="number" name="min" value={e[1]} />;
                case "precision":
                    return <input readOnly={mode == "view"} type="number" name="min" value={e[1]} />;
            }
        })
    }, [config, mode]);

    const updateAttr = React.useCallback((formData: {}) => {
        console.log("updateAttr", formData);
    }, [mode]);

    return <Form onSubmit={mode == "view" ? null : updateAttr}>
        {fields}
    </Form>
}

interface AttributeModelPanelProps extends AttributeModel {

}
const AttributeModelPanel = (props: AttributeModelPanelProps) => {
    const {
        name,
        type,
        config
    } = props;


    const { Modal: EditModal, open: openEditModal, close: closeEditModal } = useModal({areaId: "root"});
    const { Modal: DeleteModal, open: openDelModal, close: closeDelModal } = useModal({areaId: "root"});

    const confirmDeleteAttr = React.useCallback(() => {
        console.log(`Deleting attribute '${name}'`);
        closeDelModal();
    }, [name]);

    return <Card className="panel-attribute-model">
        <EditModal footer={<ActionBar items={[
            { position: "right", key: "btn-del-attr", item: <Button type="default" onClick={closeEditModal} iconName="close">Cancel</Button> },
            { position: "left", key: "btn-cancel-edit-attr", item: <Button type="primary" onClick={openDelModal} accent="#f5474c" iconName="trash">Delete</Button> }
        ]}/>}>
            <ExistingAttrConfigForm name={name} type={type} config={config} mode="edit" />
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
                { position: "right", key: "btn-edit-attr", item: <Button onClick={openEditModal} className="btn-edit-attr" iconName="pencil" type="primary" /> },
                { position: "right", key: "btn-del-attr", item: <Button onClick={openDelModal} accent="#f5474c" className="btn-del-attr" iconName="trash" type="text" /> },
            ]}
        />}>
            <span>{type}</span>
            <ExistingAttrConfigForm name={name} type={type} config={config} />
        </Accordion>
    </Card>
}

export default AttributeModelPanel;