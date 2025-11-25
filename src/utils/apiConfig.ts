/**
 * =============================================================================
 * API CONFIGURATION - Centralized API URL management
 * =============================================================================
 * 
 * Handles API base URL for both development and production:
 * - Development: Uses Vite proxy to http://localhost:8765
 * - Production (Railway): Uses relative /api path (same server)
 * 
 * VERSION: 1.0
 * =============================================================================
 */

// In production, use relative path (frontend and backend on same server)
// In development, Vite proxy handles /api -> localhost:8765
export const API_BASE_URL = '/api';

// Helper function if you ever need the full URL
export function getApiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE_URL}/${cleanPath}`;
}

export default API_BASE_URL;

