# SVDA Eval Log

Track each weekly PR after human review. `Registry Proposed` means rows appended by the routine on its PR branch. `Merged` means rows that survived review and landed on `main`.

| Date | Proposed | Registry Proposed | Merged | Precision | Cost | Notes |
|---|---:|---:|---:|---:|---:|---|
| _example_ | 9 | 6 | 4 | 0.67 | $1.83 | One geo miss; update skill examples |

## Metrics

- Precision = merged / registry proposed.
- Yield = merged rows per run.
- Cost per merge = run cost / merged.

## Kill Criteria

If precision is below 0.20 averaged over the first 3 completed runs:

1. Delete the `svda-weekly` routine.
2. Open a cleanup PR deleting `.claude/skills/venue-discovery/` and `docs/svda/`.
3. Keep `data/venue-candidates/` as audit history.

## Expansion Criteria

If precision is at least 0.40 averaged over the first 4 completed runs:

1. Add Lectures and Tech discovery themes to the skill.
2. Rotate themes weekly or select the weakest coverage category from live refresh status.
3. Consider an API trigger for manual reruns.
