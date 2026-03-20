# Phase 3: Annotation Cycle

The core of the workflow. The user adds inline notes directly into `.claude/plan.md`, then sends you back to update it.

## How It Works

1. User opens `.claude/plan.md` in their editor
2. User adds inline notes — corrections, rejections, constraints, domain knowledge
3. User tells you to address the notes
4. Read the plan, find all user annotations, update the document accordingly
5. Repeat until the user is satisfied (typically 1-6 rounds)

## Detecting Annotations

User notes vary from two words to full paragraphs. Common patterns:

| Pattern | Example |
|---------|---------|
| Explicit markers | `NOTE: this should use PATCH` |
| Corrections | `not optional`, `this is wrong` |
| Bracketed notes | `[use drizzle:generate for migrations]` |
| Rejections | `remove this section entirely` |
| Domain knowledge | `the queue consumer already handles retries` |
| Redirections | `visibility should be on the list, not individual items` |

Run the annotation scanner to find them programmatically:
```bash
python3 <skill-path>/scripts/check_annotations.py .claude/plan.md
```

## Rules

- Address **every** note. Don't skip any.
- After updating, confirm what you changed.
- **Do NOT implement yet** — this guard is non-negotiable until the user says to proceed.
- If a note is ambiguous, ask for clarification rather than guessing.
- Never remove user annotations yourself — the user removes them when satisfied.

## Why This Phase Matters

The plan is shared mutable state. The user injects judgement that you don't have: product priorities, user pain points, engineering trade-offs, team conventions. Three rounds of annotation can transform a generic plan into one that fits perfectly into the existing system.

## Example Prompts

```
I added a few notes to the document, address all the notes and update the
document accordingly. don't implement yet
```

## Phase Exit

The user says they're satisfied with the plan, or explicitly asks to move to the todo list or implementation.
