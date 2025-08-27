import { AttributeModel } from "@docstack/shared";
import React from "react";

interface AttributeModelPanelProps extends AttributeModel {

}
const AttributeModelPanel = (props: AttributeModelPanelProps) => {
    const {
        name,
        type,
        config
    } = props;

    return <div className="panel-attribute-model">
        <h3>{name}</h3>
        <span>{type}</span>
        <p>{JSON.stringify(config)}</p>
    </div>
}

export default AttributeModelPanel;