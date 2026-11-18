import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { APP_DISPLAY_NAME } from '../shared/app-name.mjs';
import './styles.css';
import './pad.css';

// 页面标题会覆盖 BrowserWindow 的 title，窗口标题栏与任务栏悬停都读这个值，
// 统一从 shared 取 Wmusic 主显示名；第三方身份说明保留在关于页和文档。
document.title = APP_DISPLAY_NAME;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
