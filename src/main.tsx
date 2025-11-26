import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error handler to catch unhandled errors
window.addEventListener('error', (event) => {
  // Filter out errors from browser extensions or external scripts
  const errorMessage = event.message || '';
  const errorSource = event.filename || '';
  
  // Check for various "Element not found" error patterns
  if (errorMessage.includes('Element not found') || 
      errorMessage.includes('element not found') ||
      errorMessage.includes('Cannot read properties') ||
      (errorSource && !errorSource.includes('localhost:8766') && !errorSource.includes('127.0.0.1:8766'))) {
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
