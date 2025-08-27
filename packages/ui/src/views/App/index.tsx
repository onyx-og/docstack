import { useAppSelector } from 'hooks';
import { BrowserRouter, Routes, Route, useNavigate} from 'react-router-dom';
import AuthView from "views/AuthView";
import { useEffect } from 'react';
import Dashboard from 'views/Dashboard';

require('@prismal/react/lib/index.css');

import "./index.scss";

const App = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const isAnonymous = useAppSelector((state) => state.auth.isAnonymous);
    const navigate = useNavigate();

    useEffect(() => {
        console.log("App - isAuthenticated or isAnonymous", {isAuthenticated, isAnonymous})
        if (!isAuthenticated && !isAnonymous) {
            navigate('/login');
        } else navigate('/');
    }, [isAuthenticated, isAnonymous]);

    return (
        <Routes>
            <Route path="/" element={<Dashboard/>}/>
            <Route path="/login" element={<AuthView />} />
        </Routes>
      );
}

export default App;