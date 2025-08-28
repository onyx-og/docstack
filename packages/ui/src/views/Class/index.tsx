import React from "react";
import { useParams } from "react-router-dom";
import {useClass} from "@docstack/react";
import ClassModelPanel from "components/ClassModelPanel";
import {Tabs} from "@prismal/react";

import "./index.scss";
import ClassDocsPanel from "components/ClassDocsPanel";

const ClassView = () => {
    const { className } = useParams();

    const {loading, error, classObj} = useClass(className!);

    const [panel, setPanel] = React.useState<string | number>("model");

    const panel_ = React.useMemo(() => {
        if (panel == "model") {
            if (classObj) {
                return <ClassModelPanel {...classObj.getModel()} />
            } else if (loading) {
                return <span>Loading</span>
            } else if (error) {
                return <span>{error}</span>
            }
        } else if (panel == "docs") {
            return <ClassDocsPanel className={className!} model={classObj?.getModel()} />
        } else {
            throw new Error(`Unexpected panel value "${panel}"`);
        }
    }, [loading, error, classObj, panel]);


    return <main className="view-class">
        <Tabs onChange={setPanel} tabsClass="view-class-tabs-header" data={[
            { name: "model", label: "Model" },
            { name: "docs", label: "Documents" },
            // { name: "stats", label: "Stats" },
        ]}/>
        {panel_}
    </main>
}

export default ClassView;