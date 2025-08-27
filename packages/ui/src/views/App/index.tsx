import { useAppDispatch, useAppSelector } from 'hooks';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AuthView from "views/AuthView";
import React from 'react';
import Dashboard from 'views/Dashboard';

require('@prismal/react/lib/index.css');

import "./index.scss";
import ClassView from 'views/Class';
import { ActionBar, Button, Header, useModal } from '@prismal/react';
import { logout } from 'features/auth';
import DebugPanel from 'components/DebugPanel';

const App = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const isAnonymous = useAppSelector((state) => state.auth.isAnonymous);
    const navigate = useNavigate();
    const dispatch = useAppDispatch()

    const doLogout = React.useCallback(() => {
        if (isAuthenticated) dispatch(logout(true));
        else throw new Error("Must be authenticated to logout");
    }, [dispatch]);

    React.useEffect(() => {
        console.log("App - isAuthenticated or isAnonymous", { isAuthenticated, isAnonymous })
        if (!isAuthenticated && !isAnonymous) {
            navigate('/login');
        } else navigate('/');
    }, [isAuthenticated, isAnonymous]);

    const { Modal, state: debugPanelState, open: openDebugPanel } = useModal({ areaId: "root" });

    const header = React.useMemo(() => {
        if (!isAuthenticated && !isAnonymous) {
            return null;
        }
        return <Header style={{
                borderBottom: "var(--color-primary) solid .1rem",
            }}>
            <ActionBar items={[
                { item: <h1>Dashboard</h1>, key: "dashboard-title", position: "left" },
                { item: <Button type="text" iconName="bug" onClick={openDebugPanel} />, key: "btn-bug", position: "right" },
                { item: <Button type="primary" onClick={doLogout}>Logout</Button>, key: "btn-logout", position: "right" }
            ]} />
        </Header>
    }, [isAuthenticated, isAnonymous]);

    return <>
        {header}

        <Modal title={"Debug Panel"}>
            <DebugPanel />
        </Modal>
        
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<AuthView />} />
            <Route path="/class/:className" element={<ClassView />} />
        </Routes>
    </>;
}

export default App;