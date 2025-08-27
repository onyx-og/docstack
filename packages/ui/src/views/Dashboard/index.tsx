
import { ActionBar, List, Button, Header, Card, Table } from "@prismal/react";
import { useAppDispatch } from "hooks";
import React, { useCallback } from "react";
import { logout } from "features/auth";
import { saveState } from "features/store";
import { useClassList } from "@docstack/react";

import "./index.scss";

const Dashboard = () => {
    const dispatch = useAppDispatch()

    const doLogout = useCallback( () => {
        dispatch(logout(true));
    }, [dispatch]);

    const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

    const { loading, error, classList } = useClassList();
    console.log({classList});

    const classList_ = React.useMemo(() => {
        if (classList.length) {
            return <List
                view="grid"
                pageSize={5}
                cols={3}
                showPageCtrl={true}
                type="raw"
            >
                {
                    classList.map((classObj) => {
                        return <Card
                            header={<div className="dashboard-class-header">
                                <h3>{classObj.name}</h3>
                                <span>{classObj.description}</span>
                            </div>}
                        >
                            {/* <Table data={classObj.getAttributes().} /> */}
                        </Card>
                    })
                }
            </List>
        } 
        return <span>Loading</span>
        
    }, [loading, classList, error]);

    // const doRequest = useCallback( () => {
    //     dispatch(testRequest(true));
    // }, [dispatch])

    return <div className="view-dashboard">
        <Header style={{
            borderBottom: "var(--color-primary) solid .1rem"
        }} >
            <ActionBar items={[
                { item: <h1>Dashboard</h1>, key: "dashboard-title", position: "left" },
                { item: <Button type="text" iconName="bug" />, key: "btn-bug", position: "right" },
                { item: <Button type="primary" onClick={doLogout}>Logout</Button>, key: "btn-logout", position: "right" }
            ]} />
        </Header>

        <main>
            <ActionBar items={[
                { item: <h2>Classes</h2>, key: "body-title", position: "left" },
                // { item: <Button type="text" iconName="bug" />, key: "btn-bug", position: "right" },
            ]} />
            <div className="view-dash-classes-container">
                {classList_}
            </div>
        </main>
        
        {/* <Button type="default" onClick={doRequest}>Test request</Button> */}
        
        <Button type="primary" onClick={doSaveState}>Save State</Button>
    </div>
}

export default Dashboard
