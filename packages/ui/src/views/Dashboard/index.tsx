
import { ActionBar, List, Button, Header, Card, Table, useModal } from "@prismal/react";
import { useAppDispatch } from "hooks";
import React, { useCallback } from "react";
import { logout } from "features/auth";
import { saveState } from "features/store";
import { useClassList } from "@docstack/react";
import DebugPanel from "components/DebugPanel";

import "./index.scss";
import ClassCard from "components/ClassCard";

const Dashboard = () => {
    const dispatch = useAppDispatch()

    const doLogout = useCallback( () => {
        dispatch(logout(true));
    }, [dispatch]);

    const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

    const { loading, error, classList } = useClassList();

    const classList_ = React.useMemo(() => {
        if (classList.length) {
            return <List
                view="list"
                pageSize={5}
                showPageCtrl={true}
                type="raw"
            >
                {
                    classList.map((classObj) => {
                        return <ClassCard 
                            name={classObj.name} description={classObj.description}
                            attributes={classObj.getAttributes()}
                        />
                    })
                }
            </List>
        } 
        return <span>Loading</span>
        
    }, [loading, classList, error]);

    // const doRequest = useCallback( () => {
    //     dispatch(testRequest(true));
    // }, [dispatch])

    const { Modal, state: debugPanelState, open: openDebugPanel } = useModal({areaId: "root"});

    return <main className="view-dashboard">
        


            <ActionBar items={[
                { item: <h2>Classes</h2>, key: "body-title", position: "left" },
                // { item: <Button type="text" iconName="bug" />, key: "btn-bug", position: "right" },
            ]} />
            <div className="view-dash-classes-container">
                {classList_}
            </div>
        
        {/* <Button type="default" onClick={doRequest}>Test request</Button> */}
        
        {/* <Button type="primary" onClick={doSaveState}>Save State</Button> */}
    </main>
}

export default Dashboard
