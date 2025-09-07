/**
 * preview.js
 * 
 * Server-side preview proxy to safely embed third-party pages in an iframe.
 * - Fetches remote HTML server-side
 * - Strips scripts/iframes/objects to avoid JS execution
 * - Adds <base> tag to resolve relative links
 * - Removes frameguard headers so frontend can embed this route
 */

import express from 'express';
import fetch from 'node-fetch';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('PreviewRoute');

// Simple HTML sanitizer: remove scripts/iframes/objects/embeds and inline event handlers
function sanitizeHtml(html) {
  if (!html) return '';
  let out = html;
  try {
    out = out
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/on[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, '');
  } catch {}
  return out;
}

router.get('/', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) {
    return res.status(400).send('Missing url parameter');
  }

  let url;
  try {
    url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
  } catch (e) {
    return res.status(400).send('Invalid URL');
  }

  logger.info('Fetching preview', { url: url.href });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'CurateMyWorldPreview/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const status = response.status;
    const contentType = response.headers.get('content-type') || 'text/html';
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
    const text = await response.text();

    // Prepare safe HTML wrapper
    const baseHref = `${url.origin}${url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1)}`;
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : url.hostname;

    const cleaned = isHtml ? sanitizeHtml(text) : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="${baseHref}">
  <title>Preview: ${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .bar { padding: 8px 12px; font-size: 12px; color: #555; background: #f7f7f7; border-bottom: 1px solid #e5e5e5; }
    .container { padding: 0; }
    img, video, iframe { max-width: 100%; height: auto; }
    a { color: #2563eb; }
    .fallback { padding: 16px; }
  </style>
</head>
<body>
  <div class="bar">Preview of <a href="${url.href}" target="_blank" rel="noopener noreferrer">${url.hostname}</a> — status ${status}</div>
  <div class="container">
    ${isHtml && cleaned ? cleaned : `<div class="fallback"><p>Unable to render HTML preview for this URL.</p><p><a href="${url.href}" target="_blank" rel="noopener noreferrer">Open in new tab</a></p></div>`}
  </div>
</body>
</html>`;

    // Ensure this response can be embedded by the frontend
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', "default-src 'self' data: https:; img-src * data:; style-src 'self' 'unsafe-inline' https:; font-src * data:; frame-ancestors *;");
    return res.status(200).send(html);
  } catch (error) {
    logger.error('Preview fetch error', { error: error.message, url: url.href });
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html><html><body><div style="padding:16px;font-family:system-ui">Failed to fetch preview. <a href="${url.href}" target="_blank" rel="noopener noreferrer">Open in new tab</a></div></body></html>`);
  }
});

export default router;

