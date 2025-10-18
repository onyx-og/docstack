
import { ActionBar, List, Button, Header, Card, Table, useModal } from "@prismal/react";
import { useAppDispatch, useAppSelector } from "hooks";
import React, { useCallback } from "react";
import { logout } from "features/auth";
import { saveState } from "features/store";
import { useClassList } from "@docstack/react";
import DebugPanel from "components/DebugPanel";

import "./index.scss";
import ClassCard from "components/ClassCard";
import ClassForm from "components/ClassForm";

const Dashboard = () => {
    const dispatch = useAppDispatch()

    const stackName = useAppSelector(s => s.stack.name);

    const doLogout = useCallback( () => {
        dispatch(logout(true));
    }, [dispatch]);

    const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

    const { loading, error, classList } = useClassList({stack: stackName});

    const { Modal: ClassCreationModal, open: openClassCreationModal, close: closeClassCreationModal } = useModal({areaId: "root"});

    const classList_ = React.useMemo(() => {
        if (classList.length) {
            return <List
                header={<ActionBar items={[
                    { position: "right", key: "btn-class-creation-open", item: <Button onClick={openClassCreationModal} type="primary" iconName="plus">New class</Button>}
                ]}/>}
                view="list"
                pageSize={5}
                showPageCtrl={true}
                type="raw"
            >
                {
                    classList.map((classObj) => {
                        return <ClassCard
                            key={classObj.name}
                            name={classObj.name} description={classObj.description}
                            attributes={Object.values(classObj.getAttributes())}
                        />
                    })
                }
            </List>
        } 
        return <span>Loading</span>
        
    }, [loading, classList, error, openClassCreationModal]);


    return <main className="view-dashboard">
        <ClassCreationModal title="Create new class" footer={<ActionBar items={[
            { position: "right", key: "btn-class-creation-close", item: <Button type="default" onClick={closeClassCreationModal} iconName="close">Cancel</Button> },
        ]} />}>
            <ClassForm onComplete={closeClassCreationModal}/>
        </ClassCreationModal>
            <ActionBar items={[
                { item: <h2>Classes</h2>, key: "body-title", position: "left" },
                // { item: <Button type="text" iconName="bug" />, key: "btn-bug", position: "right" },
            ]} />
            <div className="view-dash-classes-container">
                {classList_}
            </div>
    </main>
}

export default Dashboard
