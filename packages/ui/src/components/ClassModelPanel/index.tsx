import { ClassModel } from "@docstack/shared";
import { ActionBar, Button, List, Text, useModal } from "@prismal/react";
import AttributeListItem from "components/AttributeListItem";
import AttributeForm from "components/AttributeForm";
import TriggerForm from "components/TriggerForm";
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
            let panels = Object.values(schema).map((attrModel, i) => {
                return <AttributeListItem key={i} {...attrModel} />
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

    const {
        Modal: TriggerCreationModal,
        open: openTriggCreationModal,
        close: closeTriggCreationModal
    } = useModal({areaId: "root"});

    const openExternalDoc = React.useCallback(() => {
        window.open('https://onyx-og.github.io/docstack/docs', '_blank');
    }, []);

    return <section style={{
        padding: "2rem 1rem"
    }} className="panel-class-model">
        <Text type="heading" level={2}>{name}</Text>
        <Text type="body">{description}</Text>
        <Text type="body">{type}</Text>
        <AttributeCreationModal title="New attribute" footer={<ActionBar items={[
            { position: "left", key: "btn-attr-creation-close", item: <Button type="default" onClick={closeAttrCreationModal} iconName="close">Cancel</Button> },
        ]} />}>
            <AttributeForm closeModal={closeAttrCreationModal}/>
        </AttributeCreationModal>
        <TriggerCreationModal title="New trigger"
         footer={<ActionBar items={[
            { position: "left", key: "btn-trigg-creation-close", item: <Button type="default" onClick={closeTriggCreationModal} iconName="close">Cancel</Button> },
            { position: "right", key: "btn-trigg-creation-help", item: <Button type="primary" onClick={openExternalDoc} iconName="question" />}
        ]} />}>
            <TriggerForm closeModal={closeTriggCreationModal}/>
        </TriggerCreationModal>
        <List header={<ActionBar items={[
            { position: "left", key: "list-title-attr", item: <h3>Attributes</h3> },
            { position: "right", key: "btn-add-attr", item: <Button type="primary" onClick={openAttrCreationModal} iconName="plus">New attribute</Button>}
        ]} />} type="raw" view="list">
            {attributePanels}
        </List>
        <List header={<ActionBar items={[
            { position: "left", key: "list-title-trigg", item: <h3>Triggers</h3> },
            { position: "right", key: "btn-add-trigg", item: <Button type="primary" onClick={openTriggCreationModal} iconName="plus">New trigger</Button>}
        ]} />} type="raw" view="list">
            <div>Placeholder</div>
            <div>Such empty</div>
        </List>
        
    </section>
}

export default ClassModelPanel;