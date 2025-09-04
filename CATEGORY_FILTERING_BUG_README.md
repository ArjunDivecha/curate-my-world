# Category Filtering Bug – Event Cards Not Updating

Issue title: Event Cards do not reliably update after the first category click

Status: Investigating – reproducible; state updates are correct but UI remains unchanged after first switch

## Environment
- Frontend (Vite/React): `http://localhost:8766`
- Backend (Node/Express): `http://localhost:8765`

## Summary
- First category click usually updates the Event Cards grid.
- Subsequent category clicks change internal state (confirmed in logs: `activeCategory`, counts, and first titles) but the visible cards do not update (or appear stuck on a previous category/all).
- Refresh previously cleared results (now mitigated by a small localStorage cache).

## Reproduction
1. Start backend on port 8765 and frontend on port 8766.
2. In the UI, click "Fetch Events" to load all categories (typically 500+ events across categories).
3. Click a category card (e.g., Music) – Event Cards change correctly.
4. Click another category (e.g., Theatre/Finance) – internal state/logs show correct data, but Event Cards on screen do not visually change.

## Expected vs Actual
- Expected: Every category click re-renders Event Cards with only that category’s events.
- Actual: First click works; later clicks do not change the visible cards even though state/console shows success.

## What the Console Shows (examples captured)
- `🎯 handleCategoryFilter called with category: music`
- `🧭 Active category: music | displayedEvents: 34 | buckets: [theatre,music,food,art,tech,...]`
- `📂 Showing events for category 'music', count: 34`
- `🎯 EventCard rendering: ...` (music-specific titles)

Despite that, the visible grid shows cards that look unchanged to the user.

## Affected Frontend Files
- `src/components/Dashboard.tsx` (category grid, fetch handler, rendering, tabs)
- `src/components/EventCard.tsx` (card render; logging/preview)
- `src/components/FetchEventsButton.tsx` (fetches and sets initial state)

## Affected Backend Files (context)
- `curate-events-api/src/routes/events.js` (supplies per-category event buckets)

## Relevant Frontend Code (short excerpts)

```tsx
// src/components/Dashboard.tsx – category selection
const handleCategoryFilter = (category: string | null) => {
  console.log('🎯 handleCategoryFilter called with category:', category);
  setActiveCategory(category);
  if (category === null) {
    const all = Object.values(transformedEventsByCategory).flat();
    setEvents(all);
  } else {
    let categoryEvents: any[] = [];
    if (category === 'technology') {
      categoryEvents = [
        ...(transformedEventsByCategory['tech'] || []),
        ...(transformedEventsByCategory['technology'] || []),
      ];
    } else {
      categoryEvents = transformedEventsByCategory[category] || [];
    }
    setEvents(categoryEvents);
  }
};
```

```tsx
// src/components/Dashboard.tsx – rendering (simplified)
const displayedEvents = useMemo(() => {
  if (!Object.keys(transformedEventsByCategory).length) return events;
  if (activeCategory === null) return Object.values(transformedEventsByCategory).flat();
  if (activeCategory === 'technology') return [
    ...(transformedEventsByCategory['tech'] || []),
    ...(transformedEventsByCategory['technology'] || []),
  ];
  return transformedEventsByCategory[activeCategory] || [];
}, [activeCategory, transformedEventsByCategory, events]);

// Grid
{displayedEvents.map(event => (
  <EventCard key={`${event.id}-${activeCategory ?? 'all'}`} event={event} ... />
))}
```

## Observations
- Logs consistently confirm the correct category, correct bucket counts, and category-specific EventCard render logs after each click.
- The visible grid does not change accordingly after the first category switch.
- Controlled Tabs (`<Tabs value={activeTab}>`) and forced remounts on `EventCard` keys did not resolve the visual staleness.

## Hypotheses (ranked)
1. Multiple Dashboard trees: a non-visible instance receives updates/logs while the visible instance renders an older subtree.
2. Tabs content preservation: the shadcn Tabs may keep an older content subtree mounted/overlaid; the user still sees stale grid content.
3. Dual sources of truth: `events` vs `displayedEvents` (now unified, but history suggests a mismatch/override could occur elsewhere).
4. Layering/z-index: a fixed/sticky layer masking the updated grid (content appears similar despite actually changing beneath).
5. Late overrides: an effect or callback resets `events` after `handleCategoryFilter`, racing the UI.

## What’s Already Tried
- Use `displayedEvents` as the sole render source for the grid.
- Force remount of cards via `key={id-category}`.
- Control Tabs and auto-switch to Grid on category click.
- Scroll-to-top on category change (visually obvious switch).
- Add localStorage cache to survive hot reload/refresh (state loss mitigation).

## Minimal Path for a Fix
1. Eliminate Tabs temporarily to de-risk preserved DOM:
   - Replace Tabs with a direct conditional render of the grid only.
   - If the bug disappears, reintroduce Tabs with `forceMount={false}` (or conditional mount) so only one subtree exists.
2. Ensure a single Dashboard is mounted:
   - Add `data-instance={randomId}` and confirm only one exists in the DOM via DevTools.
3. Instrument visible tree, not just console:
   - Render a small banner above the grid with `activeCategory`, `displayedEvents.length`, and the first 3 event titles from the same array used by the grid.
4. Verify no subsequent `setEvents(...)` runs post-click:
   - Search in `Dashboard.tsx` and related components for any effects/callbacks that modify `events` after filter.

## Debug Steps for the Next Engineer/Agent
1. Temporarily remove Tabs and render only the grid:
   - If category switching works, the bug is in Tabs content preservation or layering.
2. Use React DevTools to inspect the rendered `EventCard` props after each click:
   - Confirm titles correspond to the chosen category.
3. Search for other grids/cards (duplicates) in DOM:
   - If two grids are present, hide/remove the stale one.
4. Add on-screen diagnostics (short term):
   - `Category: {activeCategory ?? 'all'} — {displayedEvents.length} events` and list first 3 titles.

## Acceptance Criteria
- Clicking any category updates the Event Cards immediately with only that category’s items.
- Switching across multiple categories repeatedly continues to update correctly.
- Refresh does not clear events (cache OK); UI remains correct post-refresh.
- Only one grid subtree exists in the DOM.

## Notes on Caching
- A lightweight cache stores `transformedEventsByCategory` + stats in `localStorage` (TTL 6h) to survive refresh during development.
- Clear All now also clears the cache.

---
If desired, the next step is to remove Tabs temporarily and render the grid-only view to confirm Tabs preservation as the cause. Once confirmed, we can reintroduce Tabs with conditional content mounting so only the active view is mounted.


