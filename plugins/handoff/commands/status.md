---
description: Check status of all Codex handoff tasks
argument-hint: "[task-id]"
allowed-tools: Bash(node:*)
---

Check the status of handoff tasks by reading the task registry.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/handoff-runtime.mjs" status
```

Present the output as a formatted table with columns: ID, Task, Status, Dispatched, Completed.

For chained tasks, show progress inline. Use markers to indicate chain flow:
- Completed tasks: checkmark
- Running task: arrow
- Pending tasks: circle
- Failed/cancelled: cross

If any tasks are stuck in "running" state with no active session monitoring them, flag them:
"Task [ID] appears to be from a previous session. Want me to check its actual status with Codex?"

If the user provides a specific task ID, show the full details for that task including the briefing, result, and any errors.
