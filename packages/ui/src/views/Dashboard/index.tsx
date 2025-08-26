import { ActionBar, Button, Header } from "@prismal/react";
import { useAppDispatch } from "hooks";
import { useCallback } from "react";
import { logout } from "features/auth";
import { saveState } from "features/store"
// import { testRequest } from "store";

const Dashboard = () => {
    const dispatch = useAppDispatch()

    const doLogout = useCallback( () => {
        dispatch(logout(true));
    }, [dispatch]);

    const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

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
        
        {/* <Button type="default" onClick={doRequest}>Test request</Button> */}
        
        <Button type="primary" onClick={doSaveState}>Save State</Button>
    </div>
}

export default Dashboard
