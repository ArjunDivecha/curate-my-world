/**
 * =============================================================================
 * API CONFIGURATION - Centralized API URL management
 * =============================================================================
 * 
 * Handles API base URL for both development and production:
 * - Preferred: VITE_API_BASE_URL from environment
 * - Development fallback: http://127.0.0.1:8765/api
 * - Production fallback: relative /api path (same origin)
 * 
 * VERSION: 1.1
 * =============================================================================
 */

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

// Get the API base URL based on environment
export function getApiBaseUrl(): string {
  // Explicit env wins across local/staging/prod
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configuredBaseUrl && configuredBaseUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredBaseUrl.trim());
  }

  // Fallback in development: call backend directly
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8765/api';
  }

  // Fallback in production: same-origin API
  return '/api';
}

// Legacy export for backwards compatibility
export const API_BASE_URL = getApiBaseUrl();

// Helper function if you ever need a full URL with path
export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/${cleanPath}`;
}

export default API_BASE_URL;
