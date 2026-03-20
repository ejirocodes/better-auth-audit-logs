# Phase 5: Implementation

When the user says to implement, execute the entire plan without stopping.

## Rules

1. Execute every task in the plan — do not cherry-pick
2. Mark each task complete (`- [x]`) in `.claude/plan.md` as you finish it
3. Do not stop until all tasks and phases are completed
4. Do not add unnecessary comments or jsdocs
5. Do not use `any` or `unknown` types
6. Run typecheck continuously to catch issues early, not at the end
7. If the project has a build command, run it at completion

## Progress

The plan document is the source of truth for progress. The user should be able to glance at it at any time and see exactly where things stand.

Check progress programmatically:
```bash
python3 <skill-path>/scripts/plan_progress.py .claude/plan.md
```

## Key Principle

Implementation should be boring. All creative decisions happened in the annotation cycles. By the time you implement, every decision should already be made.

## Example Prompt

```
implement it all. when you're done with a task or phase, mark it as completed
in the plan document. do not stop until all tasks and phases are completed.
do not add unnecessary comments or jsdocs, do not use any or unknown types.
continuously run typecheck to make sure you're not introducing new issues.
```

## Phase Exit

All tasks marked `[x]`. Build passes. Typecheck clean.
