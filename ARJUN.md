# ARJUN.md — Squirtle (Curate My World)

*Fable 5, 2026-07-06. A product memo, not an engineering doc — read FABLE.md for the code.*

## What this repo is worth

**Alive and worth keeping — it's the most polished non-quant thing you own.** 141 commits in
2026, deployed on Vercel + Railway, and the code quality is genuinely good (real timezone math,
fail-loud scraping, a hardened preview proxy). It is *not* superseded by anything in your
ecosystem — News/NightWatch/Triptych are information-feed projects, not a filterable Bay Area
events UI. The honest problem isn't the code, it's the **product shape**: it's a *pull* app. You
have to remember to open `squirtle-eta.vercel.app` and go looking. For a personal tool that costs
real money to run (Ticketmaster + Anthropic + OpenRouter + Railway Postgres), a pull app you open
twice a month is a poor return on the maintenance you're paying. The whole opportunity below is
turning it into something that comes to *you*, ranked for *you*.

## Extensions, ranked by value ÷ effort

1. **Daily digest that pushes to you (highest leverage).** You already run a 6 AM PT scheduler that
   precomputes the full event set. Add one step: after the cache is built, email yourself (and
   whoever you want) a "This weekend / next 7 days — your top N" digest. Suddenly you never open the
   app; the app opens you. *Why now:* the hard part (fresh, categorized, deduped data at 6 AM) is
   already done — this is a consumer of existing output. *First step:* in
   `curate-events-api/src/utils/venueRefreshScheduler.js`, after the daily update succeeds, render an
   HTML digest from the cached all-categories response and send it. *Reuse:* the **Gmail MCP**
   (`create_draft`/send) or a simple SMTP step; the existing scheduler and Postgres cache.

2. **"For me" ranking via your knowledge base.** Right now every event is equal. You have a
   **personal-knowledge MCP** that knows your actual tastes (music, lectures, food, the specific
   venues and artists you care about). Score each event against it and sort, so the digest and the UI
   lead with the 10 things *you'd* actually go to, not 400 undifferentiated rows. *Why now:* it's the
   difference between "a directory" and "a concierge," and it compounds the digest above. *First step:*
   a `rankForArjun(events)` step that calls `personal-knowledge search` per event cluster and attaches
   a score; sort the buckets by it. *Reuse:* **personal-knowledge MCP**, the existing category buckets.

3. **One-click add-to-calendar.** Every `EventCard` has a date/time/venue already. Add an "Add to
   Calendar" action that drops the event straight into Google Calendar. Removes the only remaining
   manual step between "saw it" and "going." *First step:* wire an action in
   `src/components/EventCard.tsx` to the **Google Calendar MCP** `create_event`. *Reuse:* Google
   Calendar MCP; existing event schema. Low effort, real daily value.

4. **Ship the P0 regression tests (protect what you use).** Zero tests today; the same correctness
   bugs (wrong times, duplicated events, phantom "today" events) keep coming back and each one is a
   thing you personally notice in the UI. The FABLE.md contract locks them. *Why now:* it's the last
   cheap-Fable day to *author* the contract; the implementation is volume typing. *First step:* hand
   the `SQUIRTLE-PIPELINE-REGRESSION-001` contract in FABLE.md to **Codex CLI** with the handoff prompt.
   *Reuse:* Codex CLI for the typing, Divecha gates keep it honest.

5. **Decide the fate of SVDA venue discovery.** You have PRDs and a candidate schema
   (`docs/svda/`, `data/venue-candidates/`) for an agent that auto-discovers new venue sources — a
   half-built subsystem. Either finish it (it directly grows the one thing that makes this app better
   than Ticketmaster alone: venue coverage) or freeze it and delete the scaffolding so it stops looking
   like live infrastructure. *First step:* a 20-minute read of `docs/svda/` to decide finish-vs-freeze.

## Quick wins (< 1 hour, outsized payoff)

- **Rotate the leaked keys (~15 min, do this regardless).** Ticketmaster/Anthropic/OpenRouter keys
  were committed to git history (`.env`, commit `0d68f6b`). Rotate them, update Railway + local `.env`.
  This is the one item with a real downside if ignored.
- **Delete the cruft (~30 min, needs your OK).** The abandoned `backend/` TypeScript tree, the orphaned
  root Python files, and unused `src/components/WeeklyCalendar.tsx` make agents edit the wrong code.
  Removing them is pure downside-removal. (I did not delete anything — global rule.)
- **Turn on a cache-failure alert.** Deep-health already exists; have it flag a stale/failed cache so a
  silent Postgres outage doesn't just show you an empty page.

## What NOT to do

- **Don't turn this into a multi-city, multi-user product.** It's tempting because the architecture is
  clean enough to generalize — but multi-tenant auth, per-city venue registries, and someone else's
  taste model is months of work for zero return to *you*. Keep it a single-user Bay Area concierge; put
  the effort into ranking and delivery (items 1-2), not scale.
- **Don't re-add the removed providers (Perplexity, Exa, Serper/SerpAPI, Apyflux).** They were pruned
  for low yield. Re-adding them chases marginal event volume at high cost and complexity; venue-scraper
  coverage (item 5) is the better lever for more events.
