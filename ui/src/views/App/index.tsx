import { useAppSelector } from 'hooks';
import { BrowserRouter, Routes, Route, useNavigate} from 'react-router-dom';
import AuthView from "views/AuthView";
import { useEffect } from 'react';
import Dashboard from 'views/Dashboard';

require('alenite-design/lib/index.css')

const App = () => {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
        } else navigate('/');
    }, [isAuthenticated]);

    return (
        <Routes>
            <Route path="/" element={<Dashboard/>}/>
            <Route path="/login" element={<AuthView />} />
        </Routes>
      );
}

export default App;