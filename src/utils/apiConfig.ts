/**
 * =============================================================================
 * API CONFIGURATION - Centralized API URL management
 * =============================================================================
 * 
 * Handles API base URL for both development and production:
 * - Development: Direct URL to backend http://127.0.0.1:8765/api
 * - Production (Railway): Uses relative /api path (same server)
 * 
 * VERSION: 1.1
 * =============================================================================
 */

// Get the API base URL based on environment
export function getApiBaseUrl(): string {
  // In development, call backend directly
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8765/api';
  }
  // In production, use relative path (frontend and backend on same server)
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

