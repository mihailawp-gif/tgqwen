import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './assets/css/style.css'
import './assets/css/app-custom.css'
import './assets/css/animations.css'
import { init } from '@telegram-apps/sdk-react';

try {
  init();
} catch (e) {
  console.warn('Telegram SDK initialization failed outside Telegram context');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
