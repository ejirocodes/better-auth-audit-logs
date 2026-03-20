# Phase 4: Todo List

Before implementation starts, add a granular task breakdown to the plan.

## Process

1. Break the plan into phases and individual tasks
2. Add checkboxes to `.claude/plan.md` (e.g., `- [ ] Task description`)
3. Tasks should be atomic and independently verifiable
4. Group into logical phases

## What Makes a Good Task

- **Atomic**: One thing per checkbox. "Add column and update model" is two tasks.
- **Verifiable**: You can confirm it's done without running the whole system. "Add `visibility` column to `lists` migration" is verifiable. "Make it work" is not.
- **Ordered**: Tasks within a phase should be in execution order.

## Progress Tracking

During implementation, check progress with:
```bash
python3 <skill-path>/scripts/plan_progress.py .claude/plan.md
```

## Example Prompt

```
add a detailed todo list to the plan, with all the phases and individual tasks
necessary to complete the plan - don't implement yet
```

## Phase Exit

**Do NOT implement yet.** Wait for user approval of the task list.
