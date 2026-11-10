import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error handler to catch unhandled errors
window.addEventListener('error', (event) => {
  // Filter out errors from browser extensions or external scripts
  const errorMessage = event.message || '';
  const errorSource = event.filename || '';
  
  // Only suppress errors whose script comes from another origin (extensions,
  // injected scripts). Errors from this app's own origin must stay visible;
  // in production that origin is not localhost:8766.
  if (errorSource && !errorSource.startsWith(window.location.origin)) {
    console.warn('Caught external error (likely from browser extension):', {
      message: errorMessage,
      source: errorSource,
      lineno: event.lineno,
      colno: event.colno
    });
    event.preventDefault(); // Prevent the error from breaking the app
    return false;
  }
  
  // Log other errors for debugging
  console.error('Unhandled error:', {
    message: errorMessage,
    source: errorSource,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled promise rejection:', event.reason);
  // Don't prevent default - let React handle it
});

createRoot(document.getElementById("root")!).render(<App />);
