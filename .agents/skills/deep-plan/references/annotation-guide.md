# Annotation Guide

How to write effective inline annotations in plan.md.

## Quick Rules

1. Write notes directly in the plan document where the issue is
2. Be as terse or as verbose as the correction requires
3. Don't worry about formatting — just make it obvious it's a note
4. You can annotate anything: approach, code snippets, trade-offs, task ordering

## Annotation Styles

### Corrections (terse)

```markdown
### API Layer

The endpoint should accept a PUT request with the full resource body.
not a PUT — use PATCH
```

### Rejections

```markdown
### Caching

We should add a Redis cache in front of the query to handle repeated lookups.
remove this section entirely, we don't need caching here
```

### Domain Knowledge

```markdown
### Migrations

We'll write a raw SQL migration to add the column.
use drizzle:generate for migrations, not raw SQL
```

### Redirections

```markdown
### Schema Changes

Add a `visibility` field to each item in the list.
this is wrong — visibility should be on the list itself, not individual items.
when a list is public, all items are public. restructure this section.
```

### Constraints

```markdown
### Refactor

We'll update the function signatures to accept the new parameter.
the signatures of these three functions should not change.
the caller should adapt, not the library.
```

### Scope Cuts

```markdown
### Phase 3: Download Feature

- [ ] Add download button to list view
- [ ] Generate CSV export

remove this phase, I don't want to implement this now
```

## Tips

- Point at the exact spot where the issue is — don't describe location in prose
- Two words is fine if that's all it takes: `"not optional"`
- For code-level corrections, paste the code shape you expect
- If you're unsure about an approach, write your concern as a question: `"should this handle the case where the list is empty?"`
