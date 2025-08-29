import { ClassModel } from "@docstack/shared";
import { List } from "@prismal/react";
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

    return <section style={{
        padding: "2rem 1rem"
    }} className="panel-class-model">
        <h2>{name}</h2>
        <span>{description}</span>
        <span>{type}</span>
        <List type="raw" view="list">
            {attributePanels}
        </List>
        
    </section>
}

export default ClassModelPanel;