import { AttributeModel } from "@docstack/shared";
import { Card, Accordion, ActionBar, Button} from "@prismal/react";
import React from "react";

import "./index.scss";

interface AttributeModelPanelProps extends AttributeModel {

}
const AttributeModelPanel = (props: AttributeModelPanelProps) => {
    const {
        name,
        type,
        config
    } = props;

    // [TODO] Move actionbar into accordion's header

    return <Card className="panel-attribute-model" header={<ActionBar
        items={[
            { position: 'left', key: 'label-attr', item: <span>Attribute</span>},
            { position: "right", key: "btn-edit-attr", item: <Button className="btn-edit-attr" iconName="pencil" type="primary" /> },
            { position: "right", key: "btn-del-attr", item: <Button className="btn-del-attr" iconName="close" type="text" /> },
        ]}
    />}>
        <Accordion header={name}>
            <span>{type}</span>
            <p>{JSON.stringify(config)}</p>
        </Accordion>
    </Card>
}

export default AttributeModelPanel;