// Orchestrate comparison between Speed Demon (Exa+Serper) and current backend
// Env:
//   BACKEND_URL (default http://127.0.0.1:8765)
//   LOCATION (default San Francisco, CA)
//   LIMIT (default 100)
//   EXA_API_KEY, SERPER_API_KEY required for speed-demon path

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { runSpeedDemon } from './speed-collector.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8765';
const LOCATION = process.env.LOCATION || 'San Francisco, CA';
const LIMIT = Number(process.env.LIMIT || 100);

function toCsvRow(fields){
  return fields.map(v=>{
    if(v===null||v===undefined) return '';
    const s=String(v);
    if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  }).join(',');
}

function toCsv(events){
  const headers=['id','title','category','startDate','endDate','venue','address','eventUrl','ticketUrl','source'];
  const rows=[headers.join(',')];
  for(const e of events){
    rows.push(toCsvRow([
      e.id, e.title, e.category||'', e.startDate||'', e.endDate||'', e.venue?.name||e.venue||'', e.address||'', e.eventUrl||'', e.ticketUrl||'', e.source||''
    ]));
  }
  return rows.join('\n');
}

async function runBackend(){
  const t0=Date.now();
  const url=new URL('/api/events/all-categories', BACKEND_URL);
  url.searchParams.set('location', LOCATION);
  url.searchParams.set('date_range', 'next 30 days');
  url.searchParams.set('limit', String(LIMIT));
  const res=await fetch(url.toString());
  const t1=Date.now();
  if(!res.ok){ const text=await res.text(); throw new Error(`Backend ${res.status}: ${text}`); }
  const data=await res.json();
  const events=Object.values(data.eventsByCategory||{}).flat();
  const domains=new Set(events.map(e=>{ try{return new URL(e.eventUrl||e.externalUrl||e.ticketUrl||'').hostname.toLowerCase()}catch{return ''} }).filter(Boolean));
  return { timing_ms: t1-t0, events, count: events.length, unique_domains: domains.size };
}

function printTable(rows){
  const pad=(s,w)=>String(s).padEnd(w);
  const headers=['Schema','Time (ms)','Events','Domains','Cost (USD est)'];
  const widths=[12,12,10,10,16];
  const line = headers.map((h,i)=>pad(h,widths[i])).join(' | ');
  console.log(line);
  console.log('-'.repeat(line.length));
  for(const r of rows){
    console.log([pad(r.schema,widths[0]), pad(r.ms,widths[1]), pad(r.events,widths[2]), pad(r.domains,widths[3]), pad(r.cost,widths[4])].join(' | '));
  }
}

async function main(){
  const outDir=path.join(process.cwd(),'outputs');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  const ts=new Date().toISOString().replace(/[:.]/g,'-');

  // Run speed demon (Exa+Serper)
  const sd = await runSpeedDemon({ location: LOCATION, limitPerCategory: LIMIT });
  fs.writeFileSync(path.join(outDir,`speed_demon_events_${ts}.csv`), toCsv(sd.events));

  // Run backend current
  const be = await runBackend();
  fs.writeFileSync(path.join(outDir,`backend_events_${ts}.csv`), toCsv(be.events));

  const rows=[
    { schema:'speed-demon', ms: sd.timing_ms, events: sd.count, domains: sd.unique_domains, cost: (sd.cost_est_usd||0).toFixed(4) },
    { schema:'current', ms: be.timing_ms, events: be.count, domains: be.unique_domains, cost: 'n/a' }
  ];

  const summary={ timestamp:ts, location:LOCATION, limit:LIMIT, rows };
  fs.writeFileSync(path.join(outDir,`comparison_summary_${ts}.json`), JSON.stringify(summary,null,2));

  console.log('\nComparison:');
  printTable(rows);
}

main().catch(e=>{ console.error('Comparison failed:', e.message); process.exit(1); });

