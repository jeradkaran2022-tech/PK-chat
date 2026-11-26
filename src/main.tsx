import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {appUpdater} from './lib/appUpdater';

appUpdater.ensureServiceWorkerRegistered();

createRoot(document.getElementById('root')!).render(<App />);
