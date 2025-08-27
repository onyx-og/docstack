import React from "react";
import { useParams } from "react-router-dom";
import {useClass} from "@docstack/react";
import ClassModelPanel from "components/ClassModelPanel";

const ClassView = () => {
    const { className } = useParams();
    console.log("classView - className", {className});

    const {loading, error, classObj} = useClass(className!);

    console.log("ClassView", {classObj});

    const panel = React.useMemo(() => {
        if (classObj) {
            return <ClassModelPanel {...classObj.getModel()} />
        } else if (loading) {
            return <span>Loading</span>
        } else if (error) {
            return <span>{error}</span>
        }
    }, [loading, error, classObj]);

    return <main className="view-class">
        {panel}
    </main>
}

export default ClassView;