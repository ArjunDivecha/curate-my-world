#!/usr/bin/env node
// Super-Hybrid experiment server (no external deps). Endpoints:
//  - GET /health
//  - GET /super-hybrid/search?location=&limit=&categories=
//  - GET /super-hybrid/stream?location=&limit=&categories=

import http from 'http';
import url from 'url';
import fs from 'fs';
import { runSpeedDemon } from '../speed-demon/speed-collector.js';
import { spawn } from 'child_process';
import path from 'path';

const PORT = parseInt(process.env.SUPER_HYBRID_PORT || '8799', 10);
const HOST = process.env.SUPER_HYBRID_HOST || '127.0.0.1';

const DEFAULT_CATEGORIES = [
  'music', 'theatre', 'art', 'food', 'tech', 'technology', 'education',
  'movies', 'finance', 'psychology', 'artificial-intelligence', 'business', 'science'
];

function normUrl(u){ try { const url=new URL(u); return url.hostname.toLowerCase()+url.pathname.toLowerCase().replace(/\/$/,''); } catch { return ''; } }

function buildCategories(param){
  if(!param) return DEFAULT_CATEGORIES;
  const list = String(param).split(',').map(s=>s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_CATEGORIES;
}

function runSonoma({ categories, quick=false }){
  return new Promise((resolve, reject)=>{
    const py = spawn('python3', ['sonoma_bridge.py', '--categories', categories.join(','), '--quick', String(quick)], {
      env: { ...process.env }, stdio: ['ignore','pipe','pipe']
    });
    let out=''; let err='';
    py.stdout.on('data', d=> out+=d.toString());
    py.stderr.on('data', d=> err+=d.toString());
    py.on('close', code=>{
      if(code!==0){ return reject(new Error(`sonoma exit ${code}: ${err}`)); }
      try { const json = JSON.parse(out); return resolve(json); } catch(e){ return reject(new Error(`sonoma parse error: ${e.message}`)); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathName = parsed.pathname || '/';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (pathName === '/health') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
  }

  // Static frontend
  if (pathName === '/' || pathName === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    try {
      const fs = await import('fs');
      const p = path.join(process.cwd(), 'experiments', 'super-hybrid', 'public', 'index.html');
      return res.end(fs.readFileSync(p));
    } catch (e) {
      res.statusCode = 500; return res.end(`<h1>Super-Hybrid</h1><p>index.html not found</p>`);
    }
  }
  if (pathName === '/app.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    try {
      const fs = await import('fs');
      const p = path.join(process.cwd(), 'experiments', 'super-hybrid', 'public', 'app.js');
      return res.end(fs.readFileSync(p));
    } catch (e) { res.statusCode = 404; return res.end('// app.js not found'); }
  }

  if (pathName === '/super-hybrid/search') {
    try{
      const location = String(parsed.query.location || 'San Francisco, CA');
      const limit = parseInt(String(parsed.query.limit || '100'), 10);
      const categories = buildCategories(parsed.query.categories);
      const turbo = await runSpeedDemon({ location, limitPerCategory: limit });
      const deep = await runSonoma({ categories, quick:false });
      const sent = new Set();
      const merged = [];
      for(const e of [...(turbo.events||[]), ...(deep.events||[])]){
        const k = normUrl(e.eventUrl||e.ticketUrl) || `${(e.title||'').toLowerCase()}|${e.startDate||''}`;
        if(!k || sent.has(k)) continue;
        sent.add(k); merged.push(e);
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: true,
        timing_ms: (turbo.timing_ms||0) + (deep.timing_ms||0),
        count: merged.length,
        cost_est_usd: Number(((turbo.cost_est_usd||0)+(deep.cost_est_usd||0)).toFixed(4)),
        turbo: { timing_ms: turbo.timing_ms, count: turbo.count },
        deep: { timing_ms: deep.timing_ms, count: deep.count },
        events: merged
      }));
    } catch(e){
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success:false, error: String(e.message||e) }));
    }
  }

  if (pathName === '/super-hybrid/sonoma' || pathName === '/super-hybrid/deep') {
    try {
      const categories = buildCategories(parsed.query.categories);
      const deep = await runSonoma({ categories, quick:false });
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: true,
        timing_ms: deep.timing_ms,
        count: deep.count,
        cost_est_usd: Number((deep.cost_est_usd||0).toFixed(4)),
        events: deep.events
      }));
    } catch(e){
      res.statusCode = 500; res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({ success:false, error: String(e.message||e) }));
    }
  }

  if (pathName === '/super-hybrid/turbo') {
    try{
      const location = String(parsed.query.location || 'San Francisco, CA');
      const limit = parseInt(String(parsed.query.limit || '100'), 10);
      const turbo = await runSpeedDemon({ location, limitPerCategory: limit });
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: true,
        timing_ms: turbo.timing_ms,
        count: turbo.count,
        cost_est_usd: Number((turbo.cost_est_usd||0).toFixed(4)),
        events: turbo.events
      }));
    } catch(e){
      res.statusCode = 500; res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({ success:false, error: String(e.message||e) }));
    }
  }

  if (pathName === '/super-hybrid/stream') {
    const location = String(parsed.query.location || 'San Francisco, CA');
    const limit = parseInt(String(parsed.query.limit || '100'), 10);
    const categories = buildCategories(parsed.query.categories);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (event, data)=>{ res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
    const sent = new Set();
    let closed=false; req.on('close', ()=>{ closed=true; });
    try{
      send('meta', { stage: 'turbo_start' });
      const turbo = await runSpeedDemon({ location, limitPerCategory: limit });
      const initial = [];
      for(const e of (turbo.events||[])){
        const k = normUrl(e.eventUrl||e.ticketUrl) || `${(e.title||'').toLowerCase()}|${e.startDate||''}`;
        if(!k || sent.has(k)) continue;
        sent.add(k); initial.push(e);
      }
      send('batch', { stage:'turbo', count: initial.length, timing_ms: turbo.timing_ms, cost: turbo.cost_est_usd||0, events: initial.slice(0, 200) });
      if (closed) return res.end();
      send('meta', { stage: 'deep_start' });
      const deep = await runSonoma({ categories, quick:false });
      const addl = [];
      for(const e of (deep.events||[])){
        const k = normUrl(e.eventUrl||e.ticketUrl) || `${(e.title||'').toLowerCase()}|${e.startDate||''}`;
        if(!k || sent.has(k)) continue;
        sent.add(k); addl.push(e);
        if (addl.length >= 200) { send('batch', { stage:'deep', chunk: addl.splice(0), timing_ms: deep.timing_ms }); }
      }
      if(addl.length) send('batch', { stage:'deep', count: addl.length, timing_ms: deep.timing_ms, events: addl });
      send('done', { total: sent.size, cost: Number(((turbo.cost_est_usd||0)+(deep.cost_est_usd||0)).toFixed(4)) });
      return res.end();
    } catch(e){
      send('error', { message: String(e.message||e) });
      return res.end();
    }
  }

  // Rules API
  if (pathName === '/rules' && req.method === 'GET') {
    try {
      const p = path.join(process.cwd(), 'experiments','speed-demon','rules.json');
      const json = fs.readFileSync(p, 'utf8');
      res.setHeader('Content-Type','application/json');
      return res.end(json);
    } catch (e) { res.statusCode=500; return res.end(JSON.stringify({error:String(e.message||e)})); }
  }
  if ((pathName === '/rules/whitelist' || pathName === '/rules/blacklist') && req.method === 'POST') {
    // read body
    let body=''; req.on('data', d=> body+=d.toString());
    req.on('end', ()=>{
      try {
        const data = body ? JSON.parse(body) : {};
        const p = path.join(process.cwd(), 'experiments','speed-demon','rules.json');
        const raw = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : { global:{}, domains:[] };
        const domain = String((data.domain||'')).toLowerCase();
        if (!domain) throw new Error('domain required');
        let entry = raw.domains.find(d=> d.domain.toLowerCase()===domain);
        if (!entry){ entry = { domain, allowPaths: [], blockPaths: [], penalizeWords: [] }; raw.domains.push(entry); }
        if (pathName.endsWith('/whitelist')) {
          // whitelist domain: no-op here (domain is added); you can optionally add allowPaths in UI
        } else {
          const mode = String(data.mode||'path');
          if (mode === 'domain') {
            // When blacklisting domain, add a catch-all block path. (User asked usually not domain; but option is available.)
            if (!entry.blockPaths.includes('^/.*$')) entry.blockPaths.push('^/.*$');
          } else {
            const pathRegex = data.path ? String(data.path) : null;
            if (!pathRegex) throw new Error('path required for path blacklist');
            if (!entry.blockPaths.includes(pathRegex)) entry.blockPaths.push(pathRegex);
          }
        }
        fs.writeFileSync(p, JSON.stringify(raw, null, 2));
        res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify({ success:true }));
      } catch (e) {
        res.statusCode = 400; res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify({ success:false, error: String(e.message||e) }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, ()=>{
  console.log(`Super-Hybrid experiment server on http://${HOST}:${PORT}`);
});
