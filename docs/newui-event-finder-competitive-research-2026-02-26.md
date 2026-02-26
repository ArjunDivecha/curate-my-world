# NewUI Investigation: Event Finder UI Competitive Research

Date: 2026-02-26  
Branch: `codex/NewUI`  
Scope: benchmark event-discovery products and define viable look-and-feel directions for Squirtle.

## Current product baseline (Squirtle)

From the current frontend (`src/components/Dashboard.tsx` and related views):
- Two primary modes: `Event View` card grid and `Date View` (day/week/weekend/30-day variants).
- Strong filter controls already exist: date presets, free-text search, typed date, category pills, provider toggles.
- Visual language is currently colorful and utility-first (Tailwind + shadcn), with heavy use of soft cards and gradient accents.

Implication: we should preserve the current filtering power, but redesign hierarchy, typography, density, and visual cohesion.

## Sites reviewed

1. [Meetup](https://www.meetup.com/)
2. [Fever](https://feverup.com/en)
3. [Eventbrite](https://www.eventbrite.com/)
4. [DICE](https://dice.fm/)
5. [Resident Advisor (RA)](https://ra.co/events/us/sanfrancisco)
6. [Bandsintown](https://www.bandsintown.com/)
7. [Songkick](https://www.songkick.com/)
8. [Time Out San Francisco](https://www.timeout.com/san-francisco)
9. [AllEvents (San Francisco)](https://allevents.in/san-francisco)
10. [Luma Discover](https://luma.com/discover)
11. [DoTheBay](https://dothebay.com/free)
12. [Ticketmaster Discover](https://www.ticketmaster.com/discover/concerts)
13. [Partiful Discover](https://partiful.com/discover)

## What these products do well

### 1) Location-first onboarding and browsing
- Meetup, Eventbrite, Ticketmaster, Fever, and Songkick all foreground city/location context early.
- Pattern to borrow: "Browsing events in [City]" as a persistent anchor in the header/filter bar.

### 2) Time shortcuts that reduce friction
- Eventbrite and AllEvents promote one-tap chips like `Today`, `This weekend`, `This week`, `This month`.
- Squirtle already has this; improvement is visual priority and tighter information scent (count preview per chip).

### 3) Strong vertical identity (not generic "all events")
- RA and DICE: nightlife/music identity, editorial confidence, taste-driven tabs (`For you`, `RA Picks`).
- Time Out: editorial city-guide framing and strong category rails.
- Partiful/Luma: community-forward and socially contextual discovery.

### 4) Recommendation loops and follow mechanics
- Bandsintown/Songkick: tracking artists and alerts.
- DICE/RA/Eventbrite: personalized or curated feeds.
- Opportunity: evolve Squirtle from static filtering into a "taste engine" layer using saved events + behavior.

### 5) Card density tuned to intent
- Ticketmaster and AllEvents lean dense and transactional.
- DICE/RA lean focused and visually punchy.
- Time Out leans editorial and browsing-heavy.

## Alternative look-and-feel directions for Squirtle

## Direction A: Editorial City Guide
Inspiration: Time Out + DoTheBay  
Use when: goal is broad city exploration, not just ticket conversion.
- Hero with city context and rotating editorial picks.
- Strong sectioning: `This Weekend`, `Free`, `Newly Added`, `Neighborhood Picks`.
- Mixed card sizes (feature card + compact list rows).
- Typography-forward, magazine-like rhythm.

## Direction B: Dark Nightlife Minimal
Inspiration: RA + DICE  
Use when: focus is music/nightlife and high-intent users.
- Dark canvas, high-contrast type, restrained accent color.
- Sparse but powerful controls: `For You`, `New`, `Picks`, plus Date/Genre/Event Type.
- Compact, confidence-heavy cards with venue/time prominence.
- "No clutter" interaction model: fewer surfaces, stronger default ranking.

## Direction C: Social Discovery Feed
Inspiration: Meetup + Partiful + Luma  
Use when: community and group participation are core.
- Feed-style event stream with social proof modules ("friends interested", "popular in your circles").
- Group/host identity becomes first-class on cards.
- "Join / RSVP / Save" actions are primary, ticket link secondary.
- Softer palette, approachable copy, social status chips.

## Direction D: Utility Power Grid
Inspiration: Eventbrite + AllEvents + Ticketmaster  
Use when: breadth and conversion speed are priorities.
- Dense card/list hybrid with high scanability and strong filter rails.
- Fast chips for date/category/price, plus location switcher always visible.
- Practical hierarchy: title -> date/time -> venue -> price -> source.
- Desktop can support split layout: filters left, results right.

## Direction E: Experience Marketplace Premium
Inspiration: Fever  
Use when: curated experiences and premium discovery are desired.
- Image-led cards, stronger art direction, premium microcopy.
- Curated collections ("Candlelight", "Immersive", "Hidden Gems").
- Category browsing as visual tiles instead of plain pills.
- More "inspiration mode" before the user refines filters.

## Direction F: Music Radar
Inspiration: Songkick + Bandsintown  
Use when: repeat weekly engagement matters.
- Personalized "radar" view: artists/genres/venues you care about.
- Follow-like behavior for venues and categories.
- Home emphasizes upcoming timeline and alert state.
- Best if paired with push/email alert hooks later.

## Direction G: Hybrid Control + Inspiration (recommended)
Inspiration: combine A + D with selective B  
Use when: you need to keep current power-user filtering but improve aesthetics.
- Keep current filter capability and date-view modes.
- Replace current stacked control block with a cleaner 2-row command bar:
  - Row 1: city, search, date chips, quick sort
  - Row 2: category chips with live counts + provider/source badges
- Add curated rails above results (`Trending`, `Free Today`, `Just Added`).
- Introduce one cohesive visual system (typography, spacing, neutral base, single accent family).

## Mapping to current code (low-risk evolution path)

1. Keep existing data/state logic in `Dashboard.tsx`.
2. Refactor only presentation layers first:
- Top control surface
- Category strip
- Event card variants (compact, feature, dense row)
- Result layout container
3. Keep existing date-view components (`DayTimetable`, `WeekDayGrid`, `WeekendSplitView`, `ThirtyDayAgendaView`) and re-skin.
4. Add optional "recommended ranking" blocks above the main list without changing backend contracts.

## Recommended next design sprint

1. Build 3 visual prototypes in code behind a feature flag:
- `editorial`
- `nightlife_minimal`
- `hybrid_control`
2. Compare on:
- Time to first meaningful event click
- Save-to-calendar rate
- Filter usage depth
- Per-session event detail opens
3. Ship the best baseline, then iterate on one personalization layer.

## Source notes

Research was based on live pages crawled on 2026-02-26:
- Meetup sections: local events, category browsing, "How Meetup works".
- Fever: city-first experience browsing in 200+ cities.
- Eventbrite: location browsing, category chips, time shortcuts (`All`, `For you`, `Today`, `This weekend`).
- DICE: search by event/venue/city, relevance-led recommendations, upfront pricing positioning.
- RA: city scoping, tabs (`All`, `For you`, `New`, `RA Picks`), Date/Genre/Event Type filters.
- Bandsintown/Songkick: near-you concert discovery and follow/alert-style positioning.
- Time Out: editorial city guide structure with category-led sections.
- AllEvents: dense listings with date shortcuts and category slices.
- Luma/Partiful: discover feeds oriented around communities and local social discovery.
- DoTheBay: local curation, free-events rails, newsletter/giveaway ecosystem.
- Ticketmaster Discover: location selector + deep genre taxonomy.
