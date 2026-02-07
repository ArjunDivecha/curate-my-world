/**
 * preview.js
 *
 * Server-side preview proxy using Jina Reader to render third-party pages.
 * Jina Reader handles JS rendering and anti-bot protections (Cloudflare, Akamai, etc.)
 * so sites like Ticketmaster that block simple fetch requests still work.
 *
 * Flow: frontend iframe → this endpoint → Jina Reader → rendered markdown → styled HTML
 */

import express from 'express';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('PreviewRoute');

const JINA_READER_BASE = 'https://r.jina.ai';

router.get('/', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) {
    return res.status(400).send('Missing url parameter');
  }

  let url;
  try {
    url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return res.status(400).send('Invalid URL');
  }

  logger.info('Fetching preview via Jina Reader', { url: url.href });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const jinaUrl = `${JINA_READER_BASE}/${url.href}`;
    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
        'X-Return-Format': 'html'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const status = response.status;
    const text = await response.text();

    if (status >= 400 || !text || text.length < 100) {
      // Jina failed — return a clean fallback with a link
      logger.warn('Jina Reader returned error or empty content', { status, url: url.href, bodyLength: text?.length });
      return sendFallback(res, url, 'Could not load preview');
    }

    // Detect bot-detection / captcha pages (e.g. Ticketmaster's Akamai)
    // Only flag as bot page if the page is small (<15KB) — large pages with
    // these strings are legitimate sites that just have noscript fallbacks.
    const textLower = text.toLowerCase();
    if (text.length < 15000) {
      const botSignals = [
        'identity verified', 'verify you are human', 'captcha',
        'not a bot', 'access denied', 'challenge-platform',
        'cf-browser-verification'
      ];
      const isBotPage = botSignals.some(s => textLower.includes(s));
      if (isBotPage) {
        logger.warn('Bot-detection page returned by Jina Reader', { url: url.href, size: text.length });
        return sendFallback(res, url, 'This site blocks automated previews');
      }
    }

    // Jina returns rendered HTML — serve it directly with our wrapper
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="${url.origin}/" target="_blank">
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; }
    img, video { max-width: 100%; height: auto; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  ${text}
</body>
</html>`;

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 min
    res.setHeader('Content-Security-Policy', "default-src 'self' data: https:; img-src * data:; style-src 'self' 'unsafe-inline' https:; font-src * data:; frame-ancestors *;");
    return res.status(200).send(html);
  } catch (error) {
    logger.error('Preview fetch error', { error: error.message, url: url.href });
    return sendFallback(res, url, error.message);
  }
});

function sendFallback(res, url, reason) {
  const domain = url.hostname.replace('www.', '');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 60px 40px; font-family: system-ui, -apple-system, sans-serif; text-align: center; color: #555; background: linear-gradient(135deg, #f0f4ff 0%, #faf0ff 100%); min-height: 100vh; box-sizing: border-box; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { color: #1a1a2e; font-size: 20px; margin: 0 0 8px; }
  .domain { color: #6366f1; font-weight: 600; }
  .reason { font-size: 13px; color: #999; margin: 8px 0 24px; }
  .btn { display: inline-block; padding: 12px 32px; background: #2563eb; color: white; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; transition: all 0.2s; }
  .btn:hover { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
</style></head><body>
  <div class="icon">&#128279;</div>
  <h2>Preview unavailable on <span class="domain">${domain}</span></h2>
  <p class="reason">${reason || 'This site requires direct browser access.'}</p>
  <a class="btn" href="${url.href}" target="_blank" rel="noopener noreferrer">Open in New Tab &rarr;</a>
</body></html>`);
}

/**
 * GET /event — Rich preview rendered from event data (no external fetch).
 * Used for sources like Ticketmaster that block automated page access.
 * All data comes from query params that the frontend already has.
 */
router.get('/event', (req, res) => {
  const q = req.query;
  const title = String(q.title || 'Event');
  const description = String(q.description || '');
  const imageUrl = String(q.imageUrl || '');
  const venue = String(q.venue || '');
  const address = String(q.address || '');
  const date = String(q.date || '');
  const time = String(q.time || '');
  const price = String(q.price || '');
  const category = String(q.category || '');
  const tags = String(q.tags || '');
  const ticketUrl = String(q.ticketUrl || '');
  const source = String(q.source || '');

  // Format date nicely
  let dateDisplay = '';
  if (date) {
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        dateDisplay = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!time) {
          const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          if (t && t !== '12:00 AM') dateDisplay += ` at ${t}`;
        }
      }
    } catch { /* ignore */ }
  }
  if (time) dateDisplay += ` at ${time}`;

  const tagList = tags ? tags.split(',').filter(Boolean) : [];

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a2e; background: #f8f9fc; }
  .hero { position: relative; width: 100%; height: 320px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); overflow: hidden; }
  .hero img { width: 100%; height: 100%; object-fit: cover; }
  .hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 32px 40px 24px; background: linear-gradient(transparent, rgba(0,0,0,0.75)); }
  .hero-overlay h1 { color: #fff; font-size: 28px; font-weight: 700; line-height: 1.2; text-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .source-badge { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.2); color: #fff; backdrop-filter: blur(4px); }
  .content { max-width: 800px; margin: 0 auto; padding: 32px 40px 48px; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 24px; }
  .meta-item { display: flex; align-items: center; gap: 8px; font-size: 15px; color: #444; }
  .meta-icon { width: 20px; height: 20px; flex-shrink: 0; }
  .description { font-size: 16px; line-height: 1.7; color: #333; margin-bottom: 28px; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
  .tag { padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; background: #eef2ff; color: #4f46e5; }
  .btn { display: inline-block; padding: 14px 36px; background: #2563eb; color: white; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; transition: all 0.2s; }
  .btn:hover { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(37,99,235,0.35); }
  .btn-secondary { background: transparent; color: #2563eb; border: 2px solid #2563eb; margin-left: 12px; }
  .btn-secondary:hover { background: #eef2ff; }
  .venue-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
  .venue-name { font-size: 17px; font-weight: 600; color: #1a1a2e; }
  .venue-address { font-size: 14px; color: #666; margin-top: 4px; }
</style>
</head><body>
  <div class="hero">
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(title)}" />` : ''}
    <div class="hero-overlay">
      <h1>${esc(title)}</h1>
      ${source ? `<span class="source-badge">${esc(source.charAt(0).toUpperCase() + source.slice(1))}</span>` : ''}
    </div>
  </div>
  <div class="content">
    <div class="meta-row">
      ${dateDisplay ? `<div class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${esc(dateDisplay)}</div>` : ''}
      ${venue ? `<div class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(venue)}</div>` : ''}
      ${price ? `<div class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>${esc(price)}</div>` : ''}
      ${category ? `<div class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>${esc(category)}</div>` : ''}
    </div>
    ${address ? `<div class="venue-card"><div class="venue-name">${esc(venue)}</div><div class="venue-address">${esc(address)}</div></div>` : ''}
    ${description ? `<div class="description">${esc(description)}</div>` : ''}
    ${tagList.length > 0 ? `<div class="tags">${tagList.map(t => `<span class="tag">${esc(t.trim())}</span>`).join('')}</div>` : ''}
    <div>
      ${ticketUrl ? `<a class="btn" href="${esc(ticketUrl)}" target="_blank" rel="noopener noreferrer">Get Tickets &rarr;</a>` : ''}
      ${ticketUrl ? `<a class="btn btn-secondary" href="${esc(ticketUrl)}" target="_blank" rel="noopener noreferrer">View on Ticketmaster</a>` : ''}
    </div>
  </div>
</body></html>`;

  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Security-Policy', "default-src 'self' data: https:; img-src * data:; style-src 'self' 'unsafe-inline' https:; font-src * data:; frame-ancestors *;");
  return res.status(200).send(html);
});

export default router;
