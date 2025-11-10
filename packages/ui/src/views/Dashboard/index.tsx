
import { ActionBar, List, Button, Header, Card, Table, useModal } from "@prismal/react";
import { useAppDispatch, useAppSelector } from "hooks";
import React, { useCallback } from "react";
import { ClassCountWidget, 
    DomainCountWidget, 
    TopClassesByDocCountWidget,
    TopClassesSummaryWidget 
} from "../../components/widgets";

import "./index.scss";
import { useQuerySQL } from "@docstack/react";

const Dashboard = () => {
    const stackName = useAppSelector(s => s.stack.name);
    // const { loading: classListLoading, error: classListError, result } = useQuerySQL(stackName,  "SELECT COUNT(*) as classCount FROM class");
    // console.log("Class list:", result, classListLoading, classListError);

    return <section className="view-dashboard">
        <div className="top-widgets-row">
            <ClassCountWidget />
            <DomainCountWidget />
        </div>
        <div className="main-widgets-grid">
            <TopClassesByDocCountWidget />
            <TopClassesSummaryWidget />
        </div>
    </section>
}

export default Dashboard
