---
description: Hand off a task to Codex with a structured briefing
argument-hint: "[--detached] [freeform task description]"
allowed-tools: Bash(node:*), Agent, AskUserQuestion
---

Invoke the `handoff-dispatcher` agent via the `Agent` tool to build a briefing and dispatch a task to Codex.

Raw user arguments:
$ARGUMENTS

## Execution

1. First, check that the codex plugin is available:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/handoff-runtime.mjs" check-codex
```

If it reports an error, show the error to the user and stop.

2. Invoke the `handoff-dispatcher` agent, forwarding `$ARGUMENTS` as the prompt context.

If arguments were provided, tell the agent: "The user wants to hand off this task: $ARGUMENTS. Build and confirm a briefing."

If no arguments were provided, tell the agent: "The user wants to hand off a task to Codex. Ask them what they need."

3. After dispatch, set up monitoring:

- If `--detached` was in the arguments, tell the user: "Task dispatched in detached mode. You'll get a push notification when it completes. Check /handoff:status any time."
- Otherwise, the dispatch runs in the foreground via the runtime script. Return the result to the user.
