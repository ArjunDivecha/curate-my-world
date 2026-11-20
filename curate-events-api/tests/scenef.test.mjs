import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneFClient } from '../src/clients/SceneFClient.js';

const NOW = Date.parse('2026-11-20T04:00:00Z');
const showtime = {
  filmKey: 'ramayana',
  venueId: 'cinelounge-fremont',
  startsAt: '2026-11-20T11:10:00-08:00',
  verified_at: '2026-11-19T22:00:00Z',
  confidence: 'venue-published',
  freshness: { status: 'current', stale_after_hours: 24 }
};
const board = {
  region: 'southbay',
  timezone: 'America/Los_Angeles',
  venues: [{
    id: 'cinelounge-fremont', name: 'Ciné Lounge Fremont 7',
    neighborhood: 'Fremont', address: '39160 Paseo Padre Parkway'
  }],
  films: [
    { key: 'ramayana', title: 'Ramayana', runtimeMin: 195 },
    { key: 'wild-horse-nine', title: 'Wild Horse Nine' }
  ],
  screenings: [
    { ...showtime, id: 'matinee' },
    { ...showtime, id: 'evening', startsAt: '2026-11-20T18:00:00-08:00' },
    { ...showtime, id: 'other-film', filmKey: 'wild-horse-nine' },
    { ...showtime, id: 'past', startsAt: '2026-11-19T10:00:00-08:00' },
    { ...showtime, id: 'disputed', confidence: 'disputed' },
    { ...showtime, id: 'stale', freshness: { status: 'stale' } },
    { ...showtime, id: 'expired', verified_at: '2026-11-18T00:00:00Z' }
  ]
};

test('normalizes separate future screenings with local times, attribution and ticket links', async () => {
  const client = new SceneFClient({
    regions: ['southbay'],
    fetchListings: async url => {
      assert.equal(url.href, 'https://scenef.com/api/listings?region=southbay&when=week&compact=1');
      return Response.json(board);
    }
  });
  await client.refresh();

  const events = client.getEvents(NOW);
  assert.deepEqual(events.map(event => event.title), ['Ramayana', 'Wild Horse Nine', 'Ramayana']);
  assert.equal(events[0].startDate, showtime.startsAt);
  assert.equal(events[0].endDate, '2026-11-20T22:25:00.000Z');
  assert.equal(events[0].description, 'Showtimes via SceneF.com');
  assert.equal(events[0].address, '39160 Paseo Padre Parkway, Fremont, CA');
  assert.equal(events[0].eventUrl, 'https://scenef.com/theater/cinelounge-fremont');
  assert.equal(events[0].ticketUrl, 'https://scenef.com/go/matinee?region=southbay');
});

test('revalidates with ETag and expires retained results after a failed refresh', async () => {
  const headers = [];
  const responses = [
    Response.json(board, { headers: { etag: '"board-v1"' } }),
    new Response(null, { status: 304 }),
    new Response(null, { status: 503 })
  ];
  const client = new SceneFClient({
    regions: ['southbay'],
    fetchListings: async (_url, options) => {
      headers.push(options.headers);
      return responses.shift();
    }
  });
  await client.refresh();
  await client.refresh();
  await client.refresh();
  assert.deepEqual(headers, [{}, { 'If-None-Match': '"board-v1"' }, { 'If-None-Match': '"board-v1"' }]);
  assert.equal(client.getEvents(NOW).length, 3);
  assert.equal(client.getEvents(Date.parse('2026-11-20T22:00:00Z')).length, 0);
});
