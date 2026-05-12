---
description: Cancel a running Codex handoff task
argument-hint: "[task-id]"
allowed-tools: Bash(node:*)
---

Cancel a running handoff task and any remaining chain tasks.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/handoff-runtime.mjs" cancel $ARGUMENTS
```

Present the result to the user. If a chain was cancelled, list which tasks were affected.
