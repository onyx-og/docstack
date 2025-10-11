import { useAppDispatch, useAppSelector } from 'hooks';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AuthView from "views/AuthView";
import React, { useContext } from 'react';
import Dashboard from 'views/Dashboard';

import { StackProvider } from "@docstack/react";
require('@prismal/react/lib/index.css');

import "./index.scss";
import ClassView from 'views/Class';
import { ActionBar, ActionBarItemConfig, Button, Header, Marquee, useModal } from '@prismal/react';
import { logout } from 'features/auth';
import DebugPanel from 'components/DebugPanel';
import StatusBar from 'components/StatusBar';
import { DocStackContext } from '@docstack/react';

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
            { item: <div className='app-title' style={{
                    height: '40px', width: '150px',
                    background: `url("${require('assets/type.svg')}")`,
                    backgroundSize: 'contain',
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: 'center',
                }}></div>, key: "dashboard-title", position: "left" },
            { item: <Button type="text" iconName="bug" onClick={openDebugPanel} />, key: "btn-bug", position: "right" },
            { item: <Button type="primary" iconName='sign-out' onClick={doLogout}/>, key: "btn-logout", position: "right" }
        )
        return items;
    }, [openDebugPanel, doLogout, location]);

    return <Header className='app-header' style={{
            borderBottom: "var(--color-primary) solid .1rem",
        }}>
            
        <Modal title={"Debug Panel"}>
            <DebugPanel />
        </Modal>
        <ActionBar items={actionBarItems} />
        
    </Header>
}

const AppStatusBar = () => {
    const docStack = useContext(DocStackContext);
    const dbName = useAppSelector((state) => state.stack.name);

    const { Modal: ChangelogModal, open: openPatchChangelog } = useModal({ areaId: "root" });

    return <StatusBar>
        <ChangelogModal title="Changelog">
            <p>{docStack?.getStack(dbName)?.patches.map(patch => patch.changelog)}</p>
        </ChangelogModal>
        <Marquee>{`Stack: ${dbName}`}</Marquee>
        <Marquee>{`Version: ${docStack?.getStack(dbName)?.appVersion}`}</Marquee>
        <Marquee onClick={openPatchChangelog}>{`Schema version: ${docStack?.getStack(dbName)?.schemaVersion}`}</Marquee>
        <Marquee speed={0.7}>Trigger definition and storing is currently in development...         Class deletion is next step in the roadmap...               
        </Marquee>
    </StatusBar>
}

const App = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const isAnonymous = useAppSelector((state) => state.auth.isAnonymous);
    const navigate = useNavigate();
    const dbName = useAppSelector((state) => state.stack.name);

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

    const statusbar = React.useMemo(() => {
        if (!isAuthenticated && !isAnonymous) {
            return null;
        }
        return <AppStatusBar />
    },[isAuthenticated, isAnonymous, location]);

    return <StackProvider config={ dbName ? [dbName] : []}>
        {header}
        
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<AuthView />} />
            <Route path="/class/:className" element={<ClassView />} />
        </Routes>
        {statusbar}
    </StackProvider>;
}

export default App;