import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/geist';
import './styles/tokens.css';
import App from './App';
import { exposeDebugApi } from './store/useStore';

exposeDebugApi();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
