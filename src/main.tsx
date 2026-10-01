import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log('[Live Voice Commerce] Script loaded at:', new Date().toISOString());

function mount() {
  try {
    let rootEl = document.getElementById('voice-commerce-root') || document.getElementById('root');
    if (!rootEl) {
      console.log('[Live Voice Commerce] #voice-commerce-root not found in DOM, creating dynamic element...');
      rootEl = document.createElement('div');
      rootEl.id = 'voice-commerce-root';
      const parent = document.body || document.documentElement;
      if (parent) {
        parent.appendChild(rootEl);
      }
    }
    if (rootEl) {
      console.log('[Live Voice Commerce] Mounting React tree to:', rootEl);
      createRoot(rootEl).render(<App />);
      console.log('[Live Voice Commerce] React tree mounted successfully.');
    }
  } catch (err) {
    console.error('[Live Voice Commerce] Mount error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
