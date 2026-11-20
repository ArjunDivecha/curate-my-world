import assert from 'node:assert/strict';
import test from 'node:test';
import { berkeleyTalks, publicStanfordTalk, UniversityTalksClient } from '../src/clients/UniversityTalksClient.js';

test('Berkeley retains separate sessions across DST and omits cancellations', () => {
  const dates = ['October 26, 2026', 'November 2, 2026', 'November 9, 2026'];
  const rows = dates.map((d, i) => `<tr><td>${d}</td><td><p><em>Developmental Psychology</em></p><ul><li>${i === 2 ? 'Canceled' : 'Guest speaker'}</li></ul></td></tr>`);
  const result = berkeleyTalks(`<p>Open to all. Colloquia are held Mondays from 12:00pm to 1:30pm in Room 1102.</p><table>${rows.join('')}</table>`);
  assert.deepEqual(result.map(e => e.startDate), ['2026-10-26T19:00:00.000Z', '2026-11-02T20:00:00.000Z']);
  assert.equal(result[0].audience, 'Open to everyone');
  assert.notEqual(result[0].id, result[1].id);
});

test('Stanford preserves occurrences and requires a public program with a relevant topic', () => {
  const event = { title: 'Preschool parenting', status: 'live', experience: 'virtual', localist_url: 'https://events.stanford.edu/event/test',
    filters: { event_audience: [{name:'Everyone'}], event_types: [{name:'Class/Seminar'}] },
    event_instances: [1, 2].map(id => ({event_instance: {id, start: `2026-12-0${id}T16:00:00-08:00`}})) };
  const occurrences = publicStanfordTalk(event);
  assert.deepEqual(occurrences.map(e => e.id), ['stanford-calendar-1', 'stanford-calendar-2']);
  assert.equal(occurrences[0].attendanceMode, 'online');
  assert.equal(occurrences[0].priceRange, undefined);
  for (const change of [{private: true}, {status:'canceled'}, {title:'Staff benefits'}, {experience:'inperson', address:'Boston, MA'},
    {filters: {...event.filters, event_audience: [{name:'Staff'}]}}, {filters: {...event.filters, event_types: [{name:'Research study'}]}}]) {
    assert.deepEqual(publicStanfordTalk({...event, ...change}), []);
  }
});

test('Source failures retain the last good result temporarily and expire stale talks', async () => {
  const now = Date.parse('2026-11-20T18:00:00Z');
  const event = {id:'talk', startDate:'2026-11-25T18:00:00Z'};
  let available = true;
  const c = new UniversityTalksClient({ test: async () => {
    if (!available) throw new Error('offline');
    return [event];
  }});
  await c.refresh(now);
  available = false;
  await c.refresh(now + 3600000);
  assert.equal(c.getEvents(now + 3600000).length, 1);
  assert.deepEqual(c.getEvents(now + 3 * 86400000), []);
});
