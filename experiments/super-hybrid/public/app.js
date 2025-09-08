(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const stats = $('stats');
  const progress = $('progress');
  const btnJson = $('btn-json');
  const btnSse = $('btn-sse');

  function card(e) {
    const d = document.createElement('div');
    d.className = 'card';
    const url = e.eventUrl || e.ticketUrl || '';
    let actions = '';
    try {
      const u = new URL(url);
      const domain = u.hostname;
      const path = u.pathname || '/';
      const esc = (s) => s.replace(/"/g,'&quot;');
      actions = `
        <div class="row" style="margin-top:8px; gap:6px;">
          <button class="wl" data-domain="${esc(domain)}">Whitelist Domain</button>
          <button class="blp" data-domain="${esc(domain)}" data-path="${esc(path)}">Blacklist Path</button>
          <button class="bld" data-domain="${esc(domain)}">Blacklist Domain</button>
        </div>
      `;
    } catch {}
    d.innerHTML = `
      <div class="title">${escapeHtml(e.title || '(untitled)')}</div>
      <div class="meta">${escapeHtml(e.category || '')} • ${escapeHtml(e.startDate || '')}</div>
      <div class="meta"><span class="src">${escapeHtml(e.source || '')}</span> • ${escapeHtml(urlHost(url))}</div>
      ${url ? `<div class="link"><a href="${url}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>` : ''}
      ${actions}
    `;
    // Attach actions if present
    d.querySelectorAll('button.wl').forEach(btn => btn.addEventListener('click', async (ev)=>{
      const domain = btn.getAttribute('data-domain');
      await fetch('/rules/whitelist', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ domain }) });
      alert(`Whitelisted ${domain}`);
    }));
    d.querySelectorAll('button.blp').forEach(btn => btn.addEventListener('click', async (ev)=>{
      const domain = btn.getAttribute('data-domain');
      const path = btn.getAttribute('data-path');
      const rx = prompt(`Blacklist path regex for ${domain}`, `^${path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`);
      if (!rx) return;
      await fetch('/rules/blacklist', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ domain, mode:'path', path: rx }) });
      alert(`Blacklisted path pattern on ${domain}`);
    }));
    d.querySelectorAll('button.bld').forEach(btn => btn.addEventListener('click', async (ev)=>{
      const domain = btn.getAttribute('data-domain');
      if (!confirm(`Blacklist ENTIRE domain ${domain}?`)) return;
      await fetch('/rules/blacklist', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ domain, mode:'domain' }) });
      alert(`Blacklisted domain ${domain}`);
    }));
    return d;
  }

  function urlHost(u) { try { return new URL(u).hostname; } catch { return ''; } }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function normKey(e){
    const u = e.eventUrl || e.ticketUrl || '';
    try { const url = new URL(u); return (url.hostname+url.pathname).toLowerCase(); } catch {}
    return ((e.title||'').toLowerCase() + '|' + (e.startDate||''));
  }

  function renderList(list){
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(ev => frag.appendChild(card(ev)));
    grid.appendChild(frag);
  }

  async function runJson(){
    const loc = $('loc').value.trim();
    const limit = Number($('limit').value || 50);
    const cats = $('cats').value.trim();
    progress.textContent = 'Fetching JSON…';
    stats.textContent = '';
    grid.innerHTML = '';
    try {
      const url = `/super-hybrid/search?location=${encodeURIComponent(loc)}&limit=${limit}&categories=${encodeURIComponent(cats)}`;
      const res = await fetch(url);
      const data = await res.json();
      stats.textContent = `Events: ${data.count} • Time: ${data.timing_ms}ms • Cost: $${(data.cost_est_usd||0).toFixed(4)}`;
      renderList(data.events || []);
    } catch (e) {
      stats.textContent = 'Error: ' + e.message;
    } finally {
      progress.textContent = '';
    }
  }

  function runSse(){
    const loc = $('loc').value.trim();
    const limit = Number($('limit').value || 50);
    const cats = $('cats').value.trim();
    progress.textContent = 'Streaming…';
    stats.textContent = '';
    grid.innerHTML = '';
    const url = `/super-hybrid/stream?location=${encodeURIComponent(loc)}&limit=${limit}&categories=${encodeURIComponent(cats)}`;
    const evs = new Map();
    const es = new EventSource(url);
    let total = 0; let received = 0;
    es.addEventListener('batch', (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        const arr = payload.events || payload.chunk || [];
        for(const e of arr){ const k = normKey(e); if(!evs.has(k)){ evs.set(k, e); received++; } }
        renderList([...evs.values()]);
        stats.textContent = `Received ${received} (stage: ${payload.stage || 'n/a'})`;
      } catch {}
    });
    es.addEventListener('meta', (msg) => {
      try { const p = JSON.parse(msg.data); progress.textContent = `Stage: ${p.stage}`; } catch {}
    });
    es.addEventListener('done', (msg) => {
      try { const p = JSON.parse(msg.data); total = p.total || evs.size; } catch {}
      progress.textContent = '';
      stats.textContent = `Done. Total unique: ${total}`;
      es.close();
    });
    es.addEventListener('error', (msg) => {
      try { const p = JSON.parse(msg.data); stats.textContent = 'Error: ' + p.message; } catch { stats.textContent = 'Stream error'; }
      progress.textContent=''; es.close();
    });
  }

  btnJson.addEventListener('click', runJson);
  btnSse.addEventListener('click', runSse);
})();
