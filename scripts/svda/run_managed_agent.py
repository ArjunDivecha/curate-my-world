#!/usr/bin/env python3
"""Start one SVDA Claude Managed Agents session.

The script intentionally uses raw HTTPS requests instead of a generated SDK
surface so the CI path stays transparent while Managed Agents is in beta.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import threading
import time
from typing import Any

import requests


API_BASE = "https://api.anthropic.com/v1"
BETA_HEADER = "managed-agents-2026-04-01"
DEFAULT_AGENT_NAME = "svda-weekly-managed"
DEFAULT_ENVIRONMENT_NAME = "svda-weekly-cloud"
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_REPO_URL = "https://github.com/ArjunDivecha/curate-my-world"
DEFAULT_MOUNT_PATH = "/workspace/curate-my-world"
DEFAULT_GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"
DEFAULT_VAULT_DISPLAY_NAME = "SVDA GitHub"
DEFAULT_MAX_SECONDS = 420
DEFAULT_MAX_TOOL_EVENTS = 16
DEFAULT_MAX_WEB_FETCH_EVENTS = 8
DEFAULT_MAX_OUTPUT_TOKENS = 2500


class AnthropicAPI:
    def __init__(self, api_key: str, dry_run: bool = False) -> None:
        self.api_key = api_key
        self.dry_run = dry_run

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": BETA_HEADER,
            "X-Api-Key": self.api_key,
        }

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{API_BASE}{path}"
        if self.dry_run and method.upper() != "GET":
            payload = kwargs.get("json")
            print(f"DRY_RUN {method.upper()} {path}")
            print(json.dumps(redact(payload), indent=2, sort_keys=True))
            return {"id": f"dry_{path.strip('/').replace('/', '_')}", "data": []}

        response = requests.request(method, url, headers=self.headers, timeout=90, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f"{method.upper()} {path} failed: {response.status_code} {response.text}")
        if not response.content:
            return {}
        return response.json()

    def stream(self, path: str) -> requests.Response:
        response = requests.get(f"{API_BASE}{path}", headers=self.headers, stream=True, timeout=(30, 300))
        if response.status_code >= 400:
            raise RuntimeError(f"GET {path} failed: {response.status_code} {response.text}")
        response.encoding = "utf-8"
        return response


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "***REDACTED***" if "token" in key.lower() or "key" in key.lower() else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def list_named(
    client: AnthropicAPI,
    path: str,
    name: str,
    name_field: str = "name",
) -> dict[str, Any] | None:
    if client.dry_run:
        return None

    page: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 100}
        if page:
            params["page"] = page
        payload = client.request("GET", path, params=params)
        for item in payload.get("data", []):
            if item.get(name_field) == name and not item.get("archived_at"):
                return item
        page = payload.get("next_page") or payload.get("next")
        if not page and payload.get("has_more") and payload.get("last_id"):
            page = payload["last_id"]
        if not page:
            return None


def ensure_agent(client: AnthropicAPI, name: str, model: str, github_mcp_url: str) -> str:
    existing = list_named(client, "/agents", name)
    if existing:
        agent_id = existing["id"]
        print(f"Reusing Managed Agent {name}: {agent_id}")
        return agent_id

    system_prompt = (
        "You are SVDA, the Squirtle Venue Discovery Agent. Complete the user's "
        "venue-discovery task inside the mounted repository. Follow "
        "repo-local instructions, validate artifacts before committing, create a "
        "branch with the claude/svda- prefix, and open a human-reviewed PR. "
        "Never push to main. Cost control is mandatory: prefer a small partial "
        "result over extended research, and stop immediately when the user task "
        "specifies a wall-clock, tool, fetch, or token cap."
    )
    payload = {
        "model": model,
        "name": name,
        "description": "Squirtle Venue Discovery Agent for weekly Bay Area venue-source PRs.",
        "metadata": {"project": "curate-my-world", "component": "svda"},
        "system": system_prompt,
        "mcp_servers": [
            {
                "type": "url",
                "name": "github",
                "url": github_mcp_url,
            }
        ],
        "tools": [
            {
                "type": "agent_toolset_20260401",
                "default_config": {"permission_policy": {"type": "always_allow"}},
            },
            {
                "type": "mcp_toolset",
                "mcp_server_name": "github",
                "default_config": {"permission_policy": {"type": "always_allow"}},
            },
        ],
    }
    created = client.request("POST", "/agents", json=payload)
    agent_id = created["id"]
    print(f"Created Managed Agent {name}: {agent_id}")
    return agent_id


def verify_auth(client: AnthropicAPI) -> None:
    if client.dry_run:
        return
    try:
        client.request("GET", "/models", params={"limit": 1})
    except RuntimeError as exc:
        raise RuntimeError(
            "ANTHROPIC_API_KEY failed a basic Claude API auth check. "
            "Create a fresh Platform API key in the Claude Console and update the "
            "GitHub repository secret before running SVDA."
        ) from exc
    print("Anthropic API key authenticated.")


def ensure_vault(client: AnthropicAPI, display_name: str) -> str:
    existing = list_named(client, "/vaults", display_name, name_field="display_name")
    if existing:
        vault_id = existing["id"]
        print(f"Reusing Managed Agents vault {display_name}: {vault_id}")
        return vault_id

    payload = {
        "display_name": display_name,
        "metadata": {"project": "curate-my-world", "component": "svda"},
    }
    created = client.request("POST", "/vaults", json=payload)
    vault_id = created["id"]
    print(f"Created Managed Agents vault {display_name}: {vault_id}")
    return vault_id


def list_credentials(client: AnthropicAPI, vault_id: str) -> list[dict[str, Any]]:
    if client.dry_run:
        return []

    credentials: list[dict[str, Any]] = []
    page: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 100}
        if page:
            params["page"] = page
        payload = client.request("GET", f"/vaults/{vault_id}/credentials", params=params)
        credentials.extend(payload.get("data", []))
        page = payload.get("next_page") or payload.get("next")
        if not page and payload.get("has_more") and payload.get("last_id"):
            page = payload["last_id"]
        if not page:
            return credentials


def normalize_mcp_url(url: str) -> str:
    return url.rstrip("/")


def ensure_github_mcp_credential(
    client: AnthropicAPI,
    vault_id: str,
    github_mcp_url: str,
    github_token: str,
) -> str:
    normalized_github_mcp_url = normalize_mcp_url(github_mcp_url)
    for credential in list_credentials(client, vault_id):
        auth = credential.get("auth") or {}
        if normalize_mcp_url(auth.get("mcp_server_url", "")) == normalized_github_mcp_url and not credential.get("archived_at"):
            credential_id = credential["id"]
            payload = {"auth": {"type": "static_bearer", "token": github_token}}
            client.request("POST", f"/vaults/{vault_id}/credentials/{credential_id}", json=payload)
            print(f"Updated GitHub MCP credential in vault: {credential_id}")
            return credential_id

    payload = {
        "auth": {
            "type": "static_bearer",
            "token": github_token,
            "mcp_server_url": normalized_github_mcp_url,
        },
        "display_name": "GitHub MCP",
        "metadata": {"project": "curate-my-world", "component": "svda"},
    }
    created = client.request("POST", f"/vaults/{vault_id}/credentials", json=payload)
    credential_id = created["id"]
    print(f"Created GitHub MCP credential in vault: {credential_id}")
    return credential_id


def ensure_environment(client: AnthropicAPI, name: str) -> str:
    existing = list_named(client, "/environments", name)
    if existing:
        environment_id = existing["id"]
        print(f"Reusing Managed Agents environment {name}: {environment_id}")
        return environment_id

    payload = {
        "name": name,
        "config": {
            "type": "cloud",
            "networking": {
                "type": "limited",
                "allowed_hosts": [
                    "github.com",
                    "api.github.com",
                    "api.githubcopilot.com",
                ],
                "allow_mcp_servers": True,
                "allow_package_managers": False,
            },
        },
    }
    created = client.request("POST", "/environments", json=payload)
    environment_id = created["id"]
    print(f"Created Managed Agents environment {name}: {environment_id}")
    return environment_id


def create_session(
    client: AnthropicAPI,
    agent_id: str,
    environment_id: str,
    vault_id: str,
    repo_url: str,
    mount_path: str,
    github_token: str,
    run_date: str,
    source_ref: str,
) -> str:
    payload = {
        "agent": agent_id,
        "environment_id": environment_id,
        "vault_ids": [vault_id],
        "title": f"SVDA weekly venue discovery {run_date}",
        "metadata": {
            "project": "curate-my-world",
            "workflow": "svda-weekly",
            "run_date": run_date,
            "source_ref": source_ref,
        },
        "resources": [
            {
                "type": "github_repository",
                "url": repo_url,
                "mount_path": mount_path,
                "authorization_token": github_token,
            }
        ],
    }
    session = client.request("POST", "/sessions", json=payload)
    session_id = session["id"]
    print(f"Created session: {session_id}")
    print(f"Managed Agents session URL: https://platform.claude.com/sessions/{session_id}")
    return session_id


def build_user_message(
    repo_mount_path: str,
    run_date: str,
    source_ref: str,
    max_seconds: int,
    max_tool_events: int,
    max_web_fetch_events: int,
    max_output_tokens: int,
) -> str:
    return f"""Run the Squirtle Venue Discovery Agent workflow for {run_date}.

Repository mount path: {repo_mount_path}
Repository source ref: {source_ref}
Hard runner caps:
- Wall clock: {max_seconds} seconds.
- Material tool events: {max_tool_events}.
- Web fetch events: {max_web_fetch_events}.
- Output tokens: {max_output_tokens}.

Instructions:
1. cd to the repository mount path.
2. Fetch and check out the source ref before reading instructions: {source_ref}.
3. Read docs/svda/PROMPT.md and follow it as the authoritative task prompt.
4. Read .claude/skills/venue-discovery/SKILL.md for the operational rules.
5. Use run date {run_date} for branch names and candidate filenames.
6. Research a maximum of 5 candidate venues. Stop early if 3 strong candidates are validated.
7. Create a branch named claude/svda-{run_date}, commit the candidate JSON and any proposed registry rows, push the branch, and open a GitHub PR against main.
8. If validation fails or caps are reached, write data/venue-candidates/{run_date}_ERROR.md or a partial candidates file, then open a PR with that artifact.

Do not push to main. Do not modify unrelated files. Do not continue researching after a cap is reached."""


def build_smoke_message(repo_mount_path: str, source_ref: str) -> str:
    return f"""Run a setup-only smoke test for the Squirtle Venue Discovery Agent.

Repository mount path: {repo_mount_path}
Repository source ref: {source_ref}

Instructions:
1. cd to the repository mount path.
2. Fetch and check out the source ref: {source_ref}.
3. Verify these files exist and are readable:
   - docs/svda/PROMPT.md
   - docs/svda/MANAGED_AGENT_CONFIG.md
   - .claude/skills/venue-discovery/SKILL.md
   - data/venue-candidates/schema.json
4. Run `python -m json.tool data/venue-candidates/schema.json`.
5. Report a concise pass/fail summary.

Do not perform venue discovery. Do not use web_search or web_fetch. Do not create a branch, commit, push, or open a PR."""


def send_user_message(client: AnthropicAPI, session_id: str, message: str) -> None:
    payload = {
        "events": [
            {
                "type": "user.message",
                "content": [{"type": "text", "text": message}],
            }
        ]
    }
    client.request("POST", f"/sessions/{session_id}/events", json=payload)
    print("Sent SVDA task message.")


def interrupt_session(client: AnthropicAPI, session_id: str, reason: str) -> None:
    if client.dry_run:
        print(f"DRY_RUN interrupt skipped: {reason}")
        return
    payload = {"events": [{"type": "user.interrupt"}]}
    try:
        client.request("POST", f"/sessions/{session_id}/events", json=payload)
        print(f"Sent interrupt to session {session_id}: {reason}")
    except Exception as exc:
        print(f"Failed to interrupt session {session_id}: {exc}", file=sys.stderr)


def parse_sse_events(response: requests.Response) -> Any:
    data_lines: list[str] = []
    for raw_line in response.iter_lines(decode_unicode=True):
        if raw_line is None:
            continue
        line = raw_line.strip()
        if not line:
            if data_lines:
                data = "\n".join(data_lines)
                data_lines.clear()
                if data == "[DONE]":
                    return
                try:
                    yield json.loads(data)
                except json.JSONDecodeError:
                    print(f"Unparseable SSE data: {data}", file=sys.stderr)
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())


def print_event(event: dict[str, Any]) -> None:
    event_type = event.get("type", "unknown")
    if event_type == "agent.message":
        for block in event.get("content", []):
            text = block.get("text")
            if text:
                print(text, end="" if text.endswith("\n") else "\n")
    elif event_type in {"agent.tool_use", "agent.mcp_tool_use"}:
        print(f"[tool] {event.get('name', event_type)}")
    elif event_type == "session.error":
        print(f"[error] {json.dumps(event.get('error', event), sort_keys=True)}")
    elif event_type.startswith("session.status"):
        print(f"[status] {event_type}")
    elif event_type.startswith("agent."):
        print(f"[agent] {event_type}")


def stream_until_idle(
    client: AnthropicAPI,
    session_id: str,
    initial_message: str,
    max_seconds: int,
    max_tool_events: int,
    max_web_fetch_events: int,
    max_output_tokens: int,
) -> None:
    if client.dry_run:
        send_user_message(client, session_id, initial_message)
        print("DRY_RUN stream skipped.")
        return

    started = time.monotonic()
    stop_event = threading.Event()
    tool_events = 0
    web_fetch_events = 0
    output_tokens = 0

    def watchdog() -> None:
        if not stop_event.wait(max_seconds):
            interrupt_session(client, session_id, f"wall-clock cap {max_seconds}s reached")

    watchdog_thread = threading.Thread(target=watchdog, daemon=True)
    watchdog_thread.start()

    with client.stream(f"/sessions/{session_id}/events/stream") as response:
        send_user_message(client, session_id, initial_message)
        for event in parse_sse_events(response):
            print_event(event)
            event_type = event.get("type")
            if time.monotonic() - started > max_seconds:
                interrupt_session(client, session_id, f"wall-clock cap {max_seconds}s reached")
                raise RuntimeError(f"SVDA stopped after exceeding {max_seconds}s wall-clock cap.")
            if event_type in {"agent.tool_use", "agent.mcp_tool_use"}:
                tool_events += 1
                tool_name = str(event.get("name", ""))
                if tool_name == "web_fetch":
                    web_fetch_events += 1
                if tool_events > max_tool_events:
                    interrupt_session(client, session_id, f"tool event cap {max_tool_events} exceeded")
                    raise RuntimeError(f"SVDA stopped after exceeding {max_tool_events} tool events.")
                if web_fetch_events > max_web_fetch_events:
                    interrupt_session(client, session_id, f"web fetch cap {max_web_fetch_events} exceeded")
                    raise RuntimeError(f"SVDA stopped after exceeding {max_web_fetch_events} web fetch events.")
            if event_type == "agent.message":
                for block in event.get("content", []):
                    output_tokens += max(1, len(block.get("text", "")) // 4)
                if output_tokens > max_output_tokens:
                    interrupt_session(client, session_id, f"output cap {max_output_tokens} estimated tokens exceeded")
                    raise RuntimeError(f"SVDA stopped after exceeding {max_output_tokens} estimated output tokens.")
            if event_type == "session.status_idle":
                stop_event.set()
                stop_reason = event.get("stop_reason") or {}
                if stop_reason.get("type") == "requires_action":
                    raise RuntimeError(f"Session requires tool confirmation: {json.dumps(stop_reason)}")
                return
            if event_type in {"session.status_failed", "session.status_error"}:
                stop_event.set()
                raise RuntimeError(f"Session failed: {json.dumps(event)}")
    stop_event.set()


def retrieve_session(client: AnthropicAPI, session_id: str) -> dict[str, Any]:
    if client.dry_run:
        return {"id": session_id, "status": "dry_run"}
    return client.request("GET", f"/sessions/{session_id}")


def list_session_events(client: AnthropicAPI, session_id: str) -> list[dict[str, Any]]:
    if client.dry_run:
        return []

    events: list[dict[str, Any]] = []
    page: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 100}
        if page:
            params["page"] = page
        payload = client.request("GET", f"/sessions/{session_id}/events", params=params)
        events.extend(payload.get("data", []))
        page = payload.get("next_page") or payload.get("next")
        if not page and payload.get("has_more") and payload.get("last_id"):
            page = payload["last_id"]
        if not page:
            return events


def summarize_session_events(events: list[dict[str, Any]]) -> None:
    errors = [event for event in events if event.get("type") == "session.error"]
    if errors:
        print("\nSession errors:")
        for event in errors:
            print(json.dumps(event.get("error", event), indent=2, sort_keys=True))
        raise RuntimeError(f"Session emitted {len(errors)} error event(s).")

    final_messages: list[str] = []
    for event in events:
        if event.get("type") != "agent.message":
            continue
        for block in event.get("content", []):
            text = block.get("text")
            if text:
                final_messages.append(text)
    if final_messages:
        print("\nFinal agent message:")
        print(final_messages[-1])


def current_pacific_date() -> str:
    try:
        from zoneinfo import ZoneInfo

        return dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:
        return dt.date.today().isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print request bodies without calling write APIs.")
    parser.add_argument("--smoke-only", action="store_true", help="Verify Managed Agents setup without venue discovery or PR creation.")
    parser.add_argument("--run-date", default=os.environ.get("SVDA_RUN_DATE", current_pacific_date()))
    parser.add_argument("--agent-name", default=os.environ.get("SVDA_AGENT_NAME", DEFAULT_AGENT_NAME))
    parser.add_argument("--environment-name", default=os.environ.get("SVDA_ENVIRONMENT_NAME", DEFAULT_ENVIRONMENT_NAME))
    parser.add_argument("--model", default=os.environ.get("SVDA_AGENT_MODEL", DEFAULT_MODEL))
    parser.add_argument("--repo-url", default=os.environ.get("SVDA_REPO_URL", DEFAULT_REPO_URL))
    parser.add_argument("--mount-path", default=os.environ.get("SVDA_MOUNT_PATH", DEFAULT_MOUNT_PATH))
    parser.add_argument("--github-mcp-url", default=os.environ.get("SVDA_GITHUB_MCP_URL", DEFAULT_GITHUB_MCP_URL))
    parser.add_argument("--vault-display-name", default=os.environ.get("SVDA_VAULT_DISPLAY_NAME", DEFAULT_VAULT_DISPLAY_NAME))
    parser.add_argument("--max-seconds", type=int, default=int(os.environ.get("SVDA_MAX_SECONDS", DEFAULT_MAX_SECONDS)))
    parser.add_argument("--max-tool-events", type=int, default=int(os.environ.get("SVDA_MAX_TOOL_EVENTS", DEFAULT_MAX_TOOL_EVENTS)))
    parser.add_argument("--max-web-fetch-events", type=int, default=int(os.environ.get("SVDA_MAX_WEB_FETCH_EVENTS", DEFAULT_MAX_WEB_FETCH_EVENTS)))
    parser.add_argument("--max-output-tokens", type=int, default=int(os.environ.get("SVDA_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS)))
    parser.add_argument(
        "--source-ref",
        default=(
            os.environ.get("SVDA_SOURCE_REF")
            or os.environ.get("GITHUB_HEAD_REF")
            or os.environ.get("GITHUB_REF_NAME")
            or "main"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    github_token = (
        os.environ.get("SVDA_GITHUB_TOKEN")
        or os.environ.get("GH_TOKEN")
        or os.environ.get("GITHUB_TOKEN")
    )

    if not api_key and not args.dry_run:
        print("ANTHROPIC_API_KEY is required.", file=sys.stderr)
        return 2
    if not github_token and not args.dry_run:
        print("SVDA_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN is required.", file=sys.stderr)
        return 2

    client = AnthropicAPI(api_key or "dry-run-key", dry_run=args.dry_run)
    started = time.monotonic()
    verify_auth(client)
    agent_id = ensure_agent(client, args.agent_name, args.model, args.github_mcp_url)
    vault_id = ensure_vault(client, args.vault_display_name)
    ensure_github_mcp_credential(client, vault_id, args.github_mcp_url, github_token or "dry-run-token")
    environment_id = ensure_environment(client, args.environment_name)
    session_id = create_session(
        client,
        agent_id,
        environment_id,
        vault_id,
        args.repo_url,
        args.mount_path,
        github_token or "dry-run-token",
        args.run_date,
        args.source_ref,
    )
    message = (
        build_smoke_message(args.mount_path, args.source_ref)
        if args.smoke_only
        else build_user_message(
            args.mount_path,
            args.run_date,
            args.source_ref,
            args.max_seconds,
            args.max_tool_events,
            args.max_web_fetch_events,
            args.max_output_tokens,
        )
    )
    stream_until_idle(
        client,
        session_id,
        message,
        args.max_seconds,
        args.max_tool_events,
        args.max_web_fetch_events,
        args.max_output_tokens,
    )
    events = list_session_events(client, session_id)
    summarize_session_events(events)
    session = retrieve_session(client, session_id)
    elapsed = time.monotonic() - started
    print("\nSession summary:")
    print(json.dumps(redact({
        "id": session.get("id"),
        "status": session.get("status"),
        "usage": session.get("usage"),
        "elapsed_seconds": round(elapsed, 1),
    }), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
