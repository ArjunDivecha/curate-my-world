import { Agent } from 'node:https';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { zonedTimeToUtcMs } from '../utils/timeZoneDate.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('UniversityTalks');
const IHD = 'https://ihd.berkeley.edu/our-colloquia';
const PSYCH = 'https://psychology.stanford.edu';
const LOCALIST = 'https://events.stanford.edu';
const stanfordAgent = new Agent({ family: 4, keepAlive: true });
const DAY = 86400000;
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const content = node => clean(node?.structuredText);
const canceled = text => /\bcancell?ed\b|\bpostponed\b/i.test(text);

async function request(url) {
  const response = await fetch(url, {
    agent: new URL(url).origin === LOCALIST ? stanfordAgent : undefined,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

function campusTime(date, clock) {
  const day = new Date(date.replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1') + ' 12:00 UTC');
  const time = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(clock);
  if (!Number.isFinite(day.getTime()) || !time || +time[1] > 12 || +time[1] < 1 || +(time[2] || 0) > 59) return null;
  const hour = +time[1] % 12 + (time[3].toLowerCase() === 'pm' ? 12 : 0);
  return new Date(zonedTimeToUtcMs({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1,
    day: day.getUTCDate(), hour, minute: +(time[2] || 0) }, 'America/Los_Angeles')).toISOString();
}

export function berkeleyTalks(html) {
  const doc = parse(html);
  const intro = doc.querySelectorAll('p').find(p => /colloquia are held/i.test(content(p)));
  const schedule = content(intro).match(/(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?) from ([\d:]+\s*[ap]m) to ([\d:]+\s*[ap]m) in ([^.]+)/i);
  if (!doc.querySelector('table tr') && /no upcoming colloquia/i.test(doc.textContent)) return [];
  if (!schedule || !doc.querySelector('table tr')) throw new Error('Unrecognized Berkeley colloquium schedule');
  const audience = /open to all|community members/i.test(content(intro)) ? 'Open to everyone' : 'Visitor access unconfirmed';
  const events = [];
  for (const row of doc.querySelectorAll('table tr')) {
    const [date, info] = row.querySelectorAll('td');
    if (!info || canceled(content(info))) continue;
    const startDate = campusTime(content(date), schedule[1]);
    const endDate = campusTime(content(date), schedule[2]);
    const series = content(info.querySelector('em'));
    const speakers = info.querySelectorAll('li').map(content).join(' · ');
    const headline = content(info.querySelector('p strong')) || [series, speakers].filter(Boolean).join(' — ');
    if (!startDate || !endDate || !headline) continue;
    events.push({
      id: `berkeley-ihd-${startDate}`, title: headline,
      description: ['UC Berkeley Institute of Human Development. Child development and developmental psychology.', series, speakers].filter(Boolean).join(' '),
      startDate, endDate, venue: schedule[3], location: 'Berkeley, CA', eventUrl: IHD,
      attendanceMode: 'inPerson', audience, source: 'uc_berkeley'
    });
  }
  return events;
}

async function stanfordPsychology(now) {
  const index = parse(await (await request(PSYCH + '/news-events/upcoming-events')).text());
  const cards = index.querySelectorAll('.hb-card__content');
  if (!cards.length && !/no (?:upcoming )?events/i.test(index.textContent)) throw new Error('Unrecognized Stanford Psychology calendar');
  const events = [];
  for (const card of cards) {
    const link = card.querySelector('h2 a');
    const path = link?.getAttribute('href') || '';
    const date = content(card.querySelector('.views-field-field-hs-event-date-4 .field-content'));
    const times = date.match(/([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?[,]? \d{4}),\s*([\d:]+\s*[ap]m)\s*[-–]\s*([\d:]+\s*[ap]m)/i);
    if (!times || !/^\/events\/[\w-]+$/.test(path)) continue;
    const startDate = campusTime(times[1], times[2]);
    const endDate = campusTime(times[1], times[3]);
    if (!startDate || !endDate || Date.parse(startDate) < now || Date.parse(startDate) > now + 32 * DAY) continue;
    const eventUrl = PSYCH + path;
    const detail = parse(await (await request(eventUrl)).text());
    const paragraphs = detail.querySelectorAll('.body.text-with-summary p').map(content);
    if (canceled([content(link), ...paragraphs.slice(0, 2)].join(' '))) continue;
    const speaker = content(card.querySelector('.views-field-body p')).split(',')[0];
    const title = paragraphs.find(p => /^title:/i.test(p))?.replace(/^title:\s*/i, '')
      || [content(link).replace(/\s+on\s+.*$/i, ''), speaker].filter(Boolean).join(' — ');
    const venue = content(card.querySelector('.views-field-field-hs-event-location .field-content'));
    const remote = /zoom|online|virtual/i.test(venue);
    events.push({ id: 'stanford-psych-' + path.split('/').pop(), title, startDate, endDate,
      venue: venue || 'Stanford Psychology', location: remote ? 'Online' : 'Stanford, CA',
      eventUrl, description: ['Stanford Department of Psychology.', ...paragraphs].join(' ').slice(0, 1800),
      audience: /open to (?:the public|everyone|all)\b/i.test(paragraphs.join(' ')) ? 'Open to everyone' : 'Visitor access unconfirmed',
      attendanceMode: remote ? 'online' : venue ? 'inPerson' : 'unknown', source: 'stanford' });
  }
  return events;
}

const PARENT_TOPIC = /\b(?:parenting|parent[- ]led|child(?:hood)? development|developmental psychology|adolescent development|kindergarten|school readiness|parent education|parent management training)\b/i;

export function publicStanfordTalk(e) {
  if (e.private || e.rejected || e.status !== 'live' || !e.localist_url?.startsWith(LOCALIST + '/event/')) return [];
  const labels = key => (e.filters?.[key] || []).map(filter => filter.name).join(' ');
  if (!/Everyone|General Public/i.test(labels('event_audience')) || !/seminar|lecture|workshop|talk|discussion/i.test(labels('event_types'))) return [];
  const topics = [e.title, ...(e.tags || []), ...(e.keywords || []), e.description_text].join(' ');
  if (!PARENT_TOPIC.test(topics) || canceled(e.title)) return [];
  const attendanceMode = { virtual: 'online', inperson: 'inPerson', hybrid: 'hybrid' }[e.experience] || 'unknown';
  if (attendanceMode !== 'online' && !/stanford|palo alto/i.test([e.address, e.location_name, e.location].join(' '))) return [];
  return (e.event_instances || []).flatMap(({ event_instance: instance }) => {
    if (!instance?.id || instance.all_day || !Number.isFinite(Date.parse(instance.start))) return [];
    return [{ id: 'stanford-calendar-' + instance.id, title: e.title, startDate: instance.start, endDate: instance.end,
      description: clean(e.description_text).slice(0, 1600),
      keywords: [...(e.tags || []), ...(e.keywords || [])], venue: attendanceMode === 'online' ? 'Stanford University · Online' : e.location_name || e.location,
      location: attendanceMode === 'online' ? 'Online' : e.address, eventUrl: e.localist_url, source: 'stanford', attendanceMode,
      audience: 'Open to everyone', priceRange: e.free || /^free(?: event)?$/i.test(e.ticket_cost || '') ? { min: 0, max: 0 } : undefined }];
  });
}

async function stanfordCalendar(groupId) {
  const events = [];
  let page = 1;
  do {
    const url = new URL('/api/2/events', LOCALIST);
    url.search = new URLSearchParams({ days: '32', pp: '100', page: String(page), group_id: groupId });
    const data = await (await request(url)).json();
    if (!Array.isArray(data.events) || data.page?.current !== page) throw new Error('Invalid Stanford calendar page');
    for (const { event } of data.events) events.push(...publicStanfordTalk(event));
    page = data.page.next_page;
  } while (page);
  return events;
}

const loaders = {
  berkeley: async () => berkeleyTalks(await (await request(IHD)).text()),
  psychology: stanfordPsychology,
  workLife: () => stanfordCalendar('38821100744361'),
  psychiatry: () => stanfordCalendar('37955141261192')
};

export class UniversityTalksClient {
  constructor(sources = loaders) { this.sources = sources; this.cache = new Map(); this.pending = null; }
  get loading() { return Boolean(this.pending); }
  start() {
    void this.refresh();
    setInterval(() => void this.refresh(), 6 * 3600000).unref();
  }
  refresh(now = Date.now()) {
    if (this.pending) return this.pending;
    this.pending = Promise.all(Object.entries(this.sources).map(async ([key, load]) => {
      try {
        const events = await load(now);
        this.cache.set(key, { events, updated: now });
      } catch (error) { logger.warn('University calendar unavailable', { key, error: error.message }); }
    })).finally(() => { this.pending = null; });
    return this.pending;
  }
  getEvents(now = Date.now()) {
    const unique = new Map();
    for (const { events, updated } of this.cache.values()) {
      if (now - updated > 2 * DAY) continue;
      for (const event of events) {
        if (Date.parse(event.startDate) < now || Date.parse(event.startDate) > now + 32 * DAY) continue;
        unique.set(event.id, { ...event, category: 'lectures', topic: 'psychology-child-development' });
      }
    }
    return [...unique.values()].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
  }
}

export const universityTalksClient = new UniversityTalksClient();
