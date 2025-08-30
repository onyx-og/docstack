import { ClassModel } from "@docstack/shared";
import { ActionBar, Button, List, useModal } from "@prismal/react";
import AttributeModelPanel from "components/AttributeModelPanel";
import React from "react";

import "./index.scss";
interface ClassModelPanelProps extends ClassModel {

}
const ClassModelPanel = (props: ClassModelPanelProps) => {
    const {
        name,
        description,
        schema,
        type,
        _id
    } = props;

    const attributePanels = React.useMemo(() => {
        if (schema) {
            let panels = schema.map((attrModel, i) => {
                console.log("attribute",attrModel);
                return <AttributeModelPanel key={i} {...attrModel} />
            });
            return panels;
        }
        return [];
    }, [schema]);

    const {
        Modal: AttributeCreationModal,
        open: openAttrCreationModal,
        close: closeAttrCreationModal
    } = useModal({areaId: "root"});

    return <section style={{
        padding: "2rem 1rem"
    }} className="panel-class-model">
        <h2>{name}</h2>
        <span>{description}</span>
        <span>{type}</span>
        <AttributeCreationModal title="New attribute" footer={<ActionBar items={[
            { position: "right", key: "btn-attr-creation-close", item: <Button type="default" onClick={closeAttrCreationModal} iconName="close">Cancel</Button> },
        ]} />}>

        </AttributeCreationModal>
        <List header={<ActionBar items={[
            { position: "right", key: "btn-add-attr", item: <Button type="primary" onClick={openAttrCreationModal} iconName="plus">New attribute</Button>}
        ]} />} type="raw" view="list">
            {attributePanels}
        </List>
        
    </section>
}

export default ClassModelPanel;