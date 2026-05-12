---
name: codex-handoff
description: Recognise when the user wants to hand off a task to Codex mid-conversation and build a pre-populated briefing from conversation context. Triggers on phrases like "hand off to codex", "delegate to codex", "let codex handle this", "send this to codex".
user-invocable: false
---

# Codex Handoff (Contextual)

You have detected that the user wants to hand off the current task or discussion to Codex.

## Your job

1. **Extract context** from the current conversation:
   - What problem or task has been discussed?
   - What files have been read, edited, or referenced?
   - What decisions have been made?
   - What constraints or requirements have been mentioned?

2. **Build a draft briefing** as JSON:

```json
{
  "task": "<one sentence: what Codex should do>",
  "context": "<background from the conversation>",
  "files": ["<files referenced in conversation>"],
  "acceptance_criteria": ["<conditions derived from discussion>"],
  "constraints": ["<any constraints mentioned>"],
  "effort": "medium",
  "mode": "write"
}
```

3. **Present the draft** to the user:

> "Based on our conversation, here's the briefing I'd send to Codex:"
>
> [formatted briefing]
>
> "Want to adjust anything before we proceed?"

4. **Invoke the handoff-dispatcher agent** with the pre-populated briefing. The agent will walk through the fields with the user, allowing them to confirm or adjust each one.

## Important

- Always present the draft briefing before dispatching. Never auto-dispatch.
- The dispatcher agent always walks through questions. The difference here is fields start pre-populated.
- If the conversation doesn't have enough context for a field, leave it empty and let the dispatcher ask.
- Do not include conversation details that aren't relevant to the task being handed off.
