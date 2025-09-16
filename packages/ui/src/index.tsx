import React from 'react';
import { createRoot } from 'react-dom/client';

import { Provider } from 'react-redux';
import App from './views/App';
import { store } from 'store';
import { BrowserRouter } from 'react-router-dom';

import { StackProvider } from "@docstack/react";

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode>
    <StackProvider dbName="client-test">
        <Provider store={store}>
            <BrowserRouter basename='/docstack/app'>
                <App />
            </BrowserRouter>
        </Provider>
    </StackProvider>
</React.StrictMode>);