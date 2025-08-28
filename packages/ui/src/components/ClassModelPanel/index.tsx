import { ClassModel } from "@docstack/shared";
import AttributeModelPanel from "components/AttributeModelPanel";
import React from "react";

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
                return <AttributeModelPanel {...attrModel} />
            });
            return panels;
        }
        return null;
    }, [schema]);

    return <section className="panel-class-model">
        <h2>{name}</h2>
        <span>{description}</span>
        <span>{type}</span>
        {attributePanels}
    </section>
}

export default ClassModelPanel;