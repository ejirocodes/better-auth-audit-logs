# Phase 7: Archive

After all tasks are complete and verified, archive the plan.

## Process

1. Ensure all tasks in the plan are marked `[x]`
2. Move `.claude/plan.md` to `docs/completed-tasks/<slug>.md`
3. Delete `.claude/research.md` — its purpose is served

Use the archive script:
```bash
python3 <skill-path>/scripts/archive_plan.py .claude/plan.md \
    --name <slug> \
    --cleanup .claude/research.md
```

The slug should be a short, descriptive name derived from the feature:
- `cursor-pagination`
- `notification-system-refactor`
- `sortable-ids`
- `admin-settings-page`

## Why Archive

This builds a project history of completed work that's browsable by anyone on the team. Each archived plan is a complete record of what was built, why, and how.
