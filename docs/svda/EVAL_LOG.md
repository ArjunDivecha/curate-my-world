# SVDA Eval Log

Track each weekly PR after human review. `Registry Proposed` means rows appended by the Managed Agent on its PR branch. `Merged` means rows that survived review and landed on `main`.

| Date | Proposed | Registry Proposed | Merged | Precision | Cost | Notes |
|---|---:|---:|---:|---:|---:|---|
| _example_ | 9 | 6 | 4 | 0.67 | $1.83 | One geo miss; update skill examples |

## Metrics

- Precision = merged / registry proposed.
- Yield = merged rows per run.
- Cost per merge = run cost / merged.

## Kill Criteria

If precision is below 0.20 averaged over the first 3 completed runs:

1. Archive or delete the `svda-weekly-managed` agent and `svda-weekly-cloud` environment.
2. Disable the weekly GitHub Actions workflow.
3. Open a cleanup PR deleting `.claude/skills/venue-discovery/`, `docs/svda/`, and `scripts/svda/`.
4. Keep `data/venue-candidates/` as audit history.

## Expansion Criteria

If precision is at least 0.40 averaged over the first 4 completed runs:

1. Add Lectures and Tech discovery themes to the skill.
2. Rotate themes weekly or select the weakest coverage category from live refresh status.
3. Consider Managed Agents outcomes for independent run grading.
