import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import './styles.css';
import './snap-design-system.css';
import { startKeyboardAvoidance } from './lib/keyboard.js';

startKeyboardAvoidance();

// Web uses normal URLs (/u/name, /p/123) so pages can be shared and indexed. The Android app
// is served from local files, where only the hash router works, so it keeps HashRouter.
const isNative = Capacitor.isNativePlatform();
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
// Links from before the switch look like /#/following; move them to the normal URL first.
if (!isNative && window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', `${basename}${window.location.hash.slice(1)}`);
}
const Router = isNative ? HashRouter : BrowserRouter;
const routerProps = isNative ? {} : { basename };

// HashRouter keeps routes working inside the Android app, where the app is
// served from local files.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </React.StrictMode>
);

// Installable PWA: register within the GitHub Pages project path and check for updates.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache 'none': the browser checks sw.js on the network, not from its HTTP cache, so new versions are found
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.error('RimSocial offline support unavailable:', error));
  });
}
