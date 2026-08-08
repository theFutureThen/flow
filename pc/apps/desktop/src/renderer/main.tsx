import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LauncherInput } from './shell/launcher/LauncherInput';
import './styles/global.css';

const container = document.getElementById('root');
if (container === null) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <LauncherInput />
  </StrictMode>,
);
