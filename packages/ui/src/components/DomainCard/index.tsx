import React, { FC } from "react";
import { Accordion, ActionBar, Button, Card } from "@prismal/react";
import { Link } from "react-router-dom";
import { Domain } from "@docstack/shared";

import "./index.scss";

interface DomainCardProps {
    name: string;
    description?: string;
    cardinality?: string;
    sourceClass?: string;
    targetClass?: string;
}

const DomainCard: FC<DomainCardProps> = (props) => {
    const { name, description, cardinality, sourceClass, targetClass } = props;

    return (
        <Card className="domain-card">
            <Accordion className="domain-card"
                header={
                    <ActionBar className="dashboard-domain-header"
                        items={[
                            { position: 'left', key: "domain-title", item: <h3>{name}</h3> },
                            { position: "right", key: "domain-link", item: <Link to={`/domain/${name}`}><Button type={"primary"} iconName="chevron-right" /></Link> }
                        ]}
                    />
                }
            >
                {description 
                    ? <><h4>Description</h4><span>{description}</span></>
                    : null}
                <h4>Relationship</h4>
                <div className="domain-relationship">
                    <span><strong>Source:</strong> {sourceClass}</span>
                    <span><strong>Cardinality:</strong> {cardinality}</span>
                    <span><strong>Target:</strong> {targetClass}</span>
                </div>
            </Accordion>
        </Card>
    );
}

export default DomainCard;
