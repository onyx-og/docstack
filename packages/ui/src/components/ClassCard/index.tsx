import React from "react";
import { ActionBar, Button, Card, Table } from "@prismal/react";
import { Attribute } from "@docstack/client";
import { Link } from "react-router-dom";

interface ClassCardProps {
    name: string;
    description?: string;
    attributes?: Attribute[];
}
const ClassCard = (props: ClassCardProps) => {
    const {name, description, attributes} = props;

    const attributes_ = React.useMemo(() => {
        let attrSet: {[key: string]: string} = {};
        attributes?.forEach((attr) => {
            let modelProc: any = attr.model;
            modelProc["config"] = JSON.stringify(modelProc.config);
            attrSet[attr.name] = modelProc;
        })
        return attrSet;
    }, [attributes]);

    return <Card
        header={<ActionBar className="dashboard-class-header"
            items={[
                { position: 'left', key: "class-title", item: <h3>{name}</h3> },
                { position: "right", key: "class-link", item: <Link to={`/class/${name}`}><Button type={"primary"} iconName="chevron-right" /></Link>}
            ]}
        />}
    >
        <span>{description}</span>
        <h4>Attributes:</h4>
        <Table data={attributes_} />
    </Card>
}

export default ClassCard;