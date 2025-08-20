import { Button } from "alenite-design";
import { useAppDispatch } from "hooks";
import { useCallback } from "react";
import { logout } from "features/auth";
import { testRequest } from "features/surfer";

const Dashboard = () => {
    const dispatch = useAppDispatch()

    const doLogout = useCallback( () => {
        dispatch(logout(true));
    }, [dispatch])

    const doRequest = useCallback( () => {
        dispatch(testRequest(true));
    }, [dispatch])

    return (
        <div>
        <h1>Dashboard</h1>
        <Button type="default" onClick={doRequest}>Test request</Button>
        <Button type="primary" onClick={doLogout}>Logout</Button>
        </div>
    );
}

export default Dashboard
