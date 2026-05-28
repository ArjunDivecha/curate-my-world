# SVDA Venue Candidate Artifacts

This directory stores weekly outputs from the Squirtle Venue Discovery Agent.

Each run writes `YYYY-MM-DD_candidates.json` with:

- proposed candidates
- rejected candidates
- fetched event-page evidence
- sample future events
- dedup status
- scoring
- whether a registry row was proposed in the same PR

The JSON sidecar is an audit trail, not the production source of truth. The production venue list remains `data/venue-registry.json`, and any registry changes must arrive through a human-reviewed PR.

Managed Agent sessions should validate candidate JSON against `schema.json` before opening a PR. If validation fails, the agent should write `YYYY-MM-DD_ERROR.md` instead of proposing registry rows.
