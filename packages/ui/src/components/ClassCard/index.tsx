import React, { FC, ReactNode } from "react";
import { Accordion, ActionBar, Button, Card, Table } from "@prismal/react";
import { Attribute } from "@docstack/client";
import { Link } from "react-router-dom";

import "./index.scss";
import { AttributeModel } from "@docstack/shared";

import "./Chip.scss";

export interface ChipProps {
children: ReactNode;
    variant?: string;
    borderRadius?: "none" | "xs" | "sm" | "md" 
    | "lg" | "xl" | "full";
    icon?: ReactNode;
    onClick?: () => void; 
}
const radiusMap = {
  none: "chip-radius-none",
  xs: "chip-radius-xs",
  sm: "chip-radius-sm",
  md: "chip-radius-md",
  lg: "chip-radius-lg",
  xl: "chip-radius-xl",
  full: "chip-radius-full",
};

const Chip: FC<ChipProps> = (props) => {
    const {borderRadius = "md", variant = "default", onClick, icon, children} = props
  const radiusClass = radiusMap[borderRadius] || radiusMap.md;

  return (
    <span
      className={`chip chip-${variant} ${radiusClass}`}
      onClick={onClick}
      role="button"
    >
      {icon && <span className="chip-icon">{icon}</span>}
      {children}
    </span>
  );
};

interface AttributeConfChipsProps {
    conf: AttributeModel["config"]
}
const AttributeConfChips: FC<AttributeConfChipsProps> = (props) => {
    const {conf} = props;

    return <div className="attr-conf-chips">
        {Object.entries(conf).map( attrConf => {
            return <Chip>{`${attrConf[0]}: ${attrConf[1]}`}</Chip>
        })}
    </div>
}

interface ClassCardProps {
    name: string;
    description?: string;
    attributes?: Attribute[];
}
const ClassCard = (props: ClassCardProps) => {
    const {name, description, attributes} = props;

    const attributes_ = React.useMemo(() => {
        let attrSet: {[key: string]: {}} = {};
        attributes?.forEach((attr) => {
            console.log("attribute model", {model: attr.model});
            let modelProc: {[key: string]: string | AttributeModel["config"]} = {...attr.model};
            modelProc["config"] = <AttributeConfChips conf={attr.model.config} />
            attrSet[attr.name] = modelProc;
        })
        return attrSet;
    }, [attributes]);

    return <Card className="class-card"><Accordion className="class-card"
        header={<ActionBar className="dashboard-class-header"
            items={[
                { position: 'left', key: "class-title", item: <h3>{name}</h3> },
                { position: "right", key: "class-link", item: <Link to={`/class/${name}`}><Button type={"primary"} iconName="chevron-right" /></Link>}
            ]}
        />}
    >
        {description 
            ? <><h4>Description</h4><span>{description}</span></>
            : null}
        <h4>Attributes</h4>
        <Table data={attributes_} />
    </Accordion></Card>
}

export default ClassCard;