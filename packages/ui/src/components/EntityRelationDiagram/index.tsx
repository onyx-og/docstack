import { ClassModel } from "@docstack/shared";
import MermaidDiagram from "components/MermaidDiagram";
import { FC, useMemo } from "react";
import { generateMermaidERD } from "utils/mermaid";
interface EntityRelationDiagramProps {
    classModel: ClassModel;
}
const EntityRelationDiagram: FC<EntityRelationDiagramProps> = (props) => {
    const {
        classModel
    } = props;

    const diagram = useMemo(() => {
        return generateMermaidERD(classModel)    
    },[classModel]);

    return <div className="erp-container">
        <MermaidDiagram 
            diagramCode={diagram} 
        />
    </div>
}

export default EntityRelationDiagram;