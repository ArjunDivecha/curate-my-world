# SVDA Managed Agent Configuration

This file documents the correct Claude Managed Agents setup for SVDA.

Anthropic docs identify three resources in the run path:

- Agent: persistent model, system prompt, tools, MCP servers, and skills.
- Environment: persistent container configuration for where sessions run.
- Session: one run of the agent inside the environment.
- Vault: per-session credentials for external services such as GitHub MCP.

The weekly schedule is not part of Managed Agents itself. GitHub Actions starts a session each week by running `scripts/svda/run_managed_agent.py`.

## Anthropic resources

| Field | Value |
|---|---|
| Agent name | `svda-weekly-managed` |
| Environment name | `svda-weekly-cloud` |
| Model | `claude-sonnet-4-6` by default |
| Beta header | `managed-agents-2026-04-01` |
| Cloud environment | `type: cloud` |
| Repo mount | `/workspace/curate-my-world` |
| Repo URL | `https://github.com/ArjunDivecha/curate-my-world` |
| Vault display name | `SVDA GitHub` |

## Agent tools

The agent uses the built-in Managed Agents toolset:

```json
{
  "type": "agent_toolset_20260401",
  "default_config": {
    "permission_policy": {
      "type": "always_allow"
    }
  }
}
```

This enables bash, read, write, edit, glob, grep, web search, and web fetch.

The agent also declares the GitHub MCP server:

```json
{
  "type": "url",
  "name": "github",
  "url": "https://api.githubcopilot.com/mcp/"
}
```

and enables its MCP toolset with `always_allow`, because the scheduled workflow is non-interactive.

GitHub MCP authentication is stored in an Anthropic Vault as a `static_bearer` credential for `https://api.githubcopilot.com/mcp`. The runner creates or reuses the vault, creates or refreshes the credential from the GitHub token, and passes `vault_ids` when creating the session.

## Environment networking

Use limited networking for shell-level access:

```json
{
  "type": "cloud",
  "networking": {
    "type": "limited",
    "allowed_hosts": [
      "github.com",
      "api.github.com",
      "api.githubcopilot.com"
    ],
    "allow_mcp_servers": true,
    "allow_package_managers": false
  }
}
```

Managed Agents `web_search` and `web_fetch` are not governed by this container networking allowlist, so venue research can still reach event pages through the native tools.

## GitHub Actions secrets

Required:

- `ANTHROPIC_API_KEY`

Optional:

- `SVDA_GITHUB_TOKEN`: fine-grained token with access to `ArjunDivecha/curate-my-world`, `contents: write`, and `pull_requests: write`.

If `SVDA_GITHUB_TOKEN` is not set, the workflow uses `github.token` with repo-scoped permissions.

## Schedule

The workflow runs manually via `workflow_dispatch` and weekly by cron. Manual dispatch defaults to `smoke_only: true`; the scheduled run on `main` performs the full venue discovery workflow.

GitHub Actions cron is UTC-only. The committed schedule uses Monday 06:00 UTC, which is Sunday 22:00 Pacific Standard Time and Sunday 23:00 Pacific Daylight Time. If exact 22:00 America/Los_Angeles wall-clock time is required year-round, replace the GitHub Actions schedule with a timezone-aware scheduler that calls the same runner.

## Smoke test

For a setup-only API smoke test from a checked-out branch, run:

```sh
python scripts/svda/run_managed_agent.py --smoke-only --source-ref <branch-name>
```

That verifies Agent, Environment, Session, repo mounting, source-ref checkout, file reads, and schema parsing without venue discovery or PR creation.

Before treating the system as live:

1. Confirm `ANTHROPIC_API_KEY` is configured in GitHub repository secrets.
2. Run `.github/workflows/svda-managed-agent.yml` manually.
3. Confirm a Managed Agents session URL is printed in the workflow logs.
4. Confirm the session reaches `session.status_idle` without `requires_action`.
5. Confirm a PR opens from a `claude/svda-*` branch.
6. Confirm the PR contains `data/venue-candidates/YYYY-MM-DD_candidates.json`.
7. Confirm any registry diff is only proposed rows in `data/venue-registry.json`.
8. Confirm the candidate JSON validates against `data/venue-candidates/schema.json`.
9. Open the Managed Agents transcript and inspect task-level failures.

Manual workflow runs on a feature branch set `SVDA_SOURCE_REF` to that branch so the session can read the setup files before they are merged to `main`. After merge, scheduled runs use `main`. Do not run full discovery from a setup branch, because the resulting PR would include the setup artifacts as well as venue proposals.

Only then leave the weekly schedule active on `main`.
