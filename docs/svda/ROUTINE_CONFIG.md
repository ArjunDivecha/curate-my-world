# SVDA Routine Configuration

Configure this as a Remote Claude Code Routine at `https://claude.ai/code/routines`.

## Routine

| Field | Value |
|---|---|
| Name | `svda-weekly` |
| Description | Squirtle Venue Discovery Agent: proposes new Bay Area venue registry rows weekly |
| Model | Sonnet, latest available in Routine UI |
| Repository | `ArjunDivecha/curate-my-world` |
| Base branch | `main` |
| Branch pushes | Default only, limited to `claude/`-prefixed branches |
| Prompt | Copy from `docs/svda/PROMPT.md` |

## Trigger

Use a weekly schedule for Sunday at 22:00 America/Los_Angeles.

If the UI does not expose raw cron directly, create a weekly Sunday 10:00 PM schedule in the web form. If using CLI update for a custom cron, use `0 22 * * 0`.

## Environment

Start with the default cloud environment. If web research or shell fetches fail with `host_not_allowed`, update the environment network access to allow the required domains or prefer native `web_search` and `web_fetch` tools.

No repo runtime secrets are required for Phase 1. Native Routine inference and native web tools should be preferred.

## Connectors

Remove connectors that are not needed. The routine should need only repository access and native web tools for Phase 1.

## Required Smoke Test

Before enabling the schedule:

1. Click `Run now`.
2. Confirm the run opens a PR from a `claude/svda-*` branch.
3. Open the run transcript and verify there were no task-level network, connector, validation, or branch permission failures.
4. Confirm the PR contains `data/venue-candidates/YYYY-MM-DD_candidates.json`.
5. Confirm any registry diff is only proposed rows in `data/venue-registry.json`.
6. Confirm JSON validates against `data/venue-candidates/schema.json`.
7. Confirm the routine could not push to `main`.

Only then enable the recurring schedule.
