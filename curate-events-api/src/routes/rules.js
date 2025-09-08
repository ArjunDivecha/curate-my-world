/**
 * rules.js
 * Proxy endpoints for Super-Hybrid rules (whitelist/blacklist) so the main frontend
 * can call through the backend without CORS changes.
 */

import express from 'express';
import { config } from '../utils/config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const u = new URL('/rules', config.superHybrid.url);
    const r = await fetch(u.toString());
    const txt = await r.text();
    res.status(r.status).type('application/json').send(txt);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/whitelist', async (req, res) => {
  try {
    const u = new URL('/rules/whitelist', config.superHybrid.url);
    const r = await fetch(u.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const txt = await r.text();
    res.status(r.status).type('application/json').send(txt);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/blacklist', async (req, res) => {
  try {
    const u = new URL('/rules/blacklist', config.superHybrid.url);
    const r = await fetch(u.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const txt = await r.text();
    res.status(r.status).type('application/json').send(txt);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

