/**
 * Input validation and sanitization utilities
 */

import { z } from 'zod';

/**
 * Sanitize HTML input to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove script tags and their content
  const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  let sanitized = input.replace(scriptRegex, '');
  
  // Remove dangerous HTML attributes
  const dangerousAttrs = /(?:on\w+|javascript:|data:text\/html|style\s*=)/gi;
  sanitized = sanitized.replace(dangerousAttrs, '');
  
  // Remove HTML tags except safe ones
  const safeTags = /^(b|i|em|strong|u|br|p|div|span|a|ul|ol|li|h[1-6])$/i;
  sanitized = sanitized.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, slash, tag, attrs) => {
    if (safeTags.test(tag)) {
      // Keep safe tags but sanitize attributes
      const safeAttrs = attrs.replace(dangerousAttrs, '');
      return `<${slash}${tag}${safeAttrs}>`;
    }
    return ''; // Remove unsafe tags
  });
  
  return sanitized.trim();
}

/**
 * Sanitize string input for database queries
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes and control characters except newlines and tabs
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validate email format
 */
export const emailSchema = z.string().email().min(1).max(255);

/**
 * Validate password requirements
 */
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and numbers');

/**
 * Validate location input
 */
export const locationSchema = z.string()
  .min(2, 'Location must be at least 2 characters')
  .max(100, 'Location must be less than 100 characters')
  .regex(/^[a-zA-Z0-9\s,.-]+$/, 'Location contains invalid characters');

/**
 * Validate event preferences
 */
export const eventPreferencesSchema = z.object({
  categories: z.array(z.string().min(1).max(50)).max(10),
  priceRange: z.object({
    min: z.number().min(0).max(10000),
    max: z.number().min(0).max(10000)
  }).optional(),
  timePreferences: z.array(z.string()).max(5).optional(),
  customKeywords: z.array(z.string().min(1).max(50)).max(20).optional()
});

/**
 * Validate URL format
 */
export const urlSchema = z.string().url().max(2000);

/**
 * Rate limiting check (simple in-memory implementation)
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const key = identifier;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or create new entry
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  current.count++;
  return true;
}

/**
 * Validate and sanitize search query
 */
export function validateSearchQuery(query: string): string {
  if (typeof query !== 'string') {
    throw new Error('Search query must be a string');
  }
  
  const sanitized = sanitizeString(query);
  
  if (sanitized.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }
  
  if (sanitized.length > 200) {
    throw new Error('Search query must be less than 200 characters');
  }
  
  return sanitized;
}
