import { useAppDispatch, useAppSelector } from 'hooks';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AuthView from "views/AuthView";
import React from 'react';
import Dashboard from 'views/Dashboard';

require('@prismal/react/lib/index.css');

import "./index.scss";
import ClassView from 'views/Class';
import { ActionBar, ActionBarItemConfig, Button, Header, Text, useModal } from '@prismal/react';
import { logout } from 'features/auth';
import DebugPanel from 'components/DebugPanel';

const AppHeader = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const isAnonymous = useAppSelector((state) => state.auth.isAnonymous);
    const navigate = useNavigate();
    const dispatch = useAppDispatch()

    const location = useLocation();

    const { Modal, state: debugPanelState, open: openDebugPanel } = useModal({ areaId: "root" });
    const doLogout = React.useCallback(() => {
        if (isAuthenticated) dispatch(logout(true));
        else throw new Error("Must be authenticated to logout");
    }, [dispatch]);

    const backNavigation = React.useCallback(() => {
        navigate(-1)
    }, [navigate]);

    const actionBarItems = React.useMemo(() => {
        let items: ActionBarItemConfig[] = [];
        if (location.pathname == "/") {
            items.push({
                item: <div style={{
                    height: '40px', width: '40px',
                    background: `url("${require('assets/logo.svg')}")`,
                    backgroundSize: 'contain'
                }}></div>, key: "nav-logo", position: "left"
            })
        } else {
            items.push({
                item: <Button type="text" onClick={backNavigation} shape='circle' iconName="chevron-left" />, key: "btn-back", position: "left"
            })
        }
        items.push(
            { item: <Text type="heading" level={1}>Dashboard</Text>, key: "dashboard-title", position: "left" },
            { item: <Button type="text" iconName="bug" onClick={openDebugPanel} />, key: "btn-bug", position: "right" },
            { item: <Button type="primary" onClick={doLogout}>Logout</Button>, key: "btn-logout", position: "right" }
        )
        return items;
    }, [openDebugPanel, doLogout, location]);

    return <Header style={{
            borderBottom: "var(--color-primary) solid .1rem",
        }}>
            
        <Modal title={"Debug Panel"}>
            <DebugPanel />
        </Modal>
        <ActionBar items={actionBarItems} />
        
    </Header>
}

const App = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const isAnonymous = useAppSelector((state) => state.auth.isAnonymous);
    const navigate = useNavigate();

    const location = useLocation();

    React.useEffect(() => {
        if (!isAuthenticated && !isAnonymous) {
            navigate('/login');
        } else navigate('/');
    }, [isAuthenticated, isAnonymous]);

    const header = React.useMemo(() => {
        if (!isAuthenticated && !isAnonymous) {
            return null;
        }
        return <AppHeader />
    }, [isAuthenticated, isAnonymous, location]);

    return <>
        {header}
        
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<AuthView />} />
            <Route path="/class/:className" element={<ClassView />} />
        </Routes>
    </>;
}

export default App;