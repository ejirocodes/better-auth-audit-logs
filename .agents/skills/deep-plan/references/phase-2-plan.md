# Phase 2: Plan

After the user reviews research.md, write a detailed implementation plan to `.claude/plan.md` using the template at `assets/templates/plan-template.md`.

## What the Plan Must Include

- Detailed explanation of the approach
- Code snippets showing the actual changes (not pseudocode)
- File paths that will be modified or created
- Considerations and trade-offs
- How the changes integrate with existing patterns found in research

## Rules

- Base the plan on the actual codebase. Read source files before proposing changes. Never design in a vacuum.
- When the user provides reference code from open source or other projects, use it as a concrete model — not vague inspiration.
- Every code snippet must reference a real file path in the project.
- If a change touches an existing function, show the before and after.

## Example Prompts

```
I want to build a new feature <name and description> that extends the system to
perform <business outcome>. write a detailed .claude/plan.md document outlining
how to implement this. include code snippets
```

```
the list endpoint should support cursor-based pagination instead of offset.
write a detailed .claude/plan.md for how to achieve this. read source files
before suggesting changes, base the plan on the actual codebase
```

## Optional: Interview

After writing the initial plan, if ambiguities remain that would waste annotation cycles, run an interview before handing the plan to the user.

**When to run it:**
- Multiple valid architectural approaches exist (e.g., sync vs async, polling vs webhooks, denormalize vs join)
- Data modeling decisions that depend on access patterns or scale expectations the codebase doesn't reveal
- API design choices: endpoint shape, auth strategy, versioning, error contract
- The feature involves UI/UX decisions you can't infer from the codebase
- Migration or backwards-compatibility strategy is unclear (big-bang vs incremental, feature flags)
- Performance or consistency trade-offs where the right answer depends on product context (eventual consistency OK? acceptable latency?)
- Business logic edge cases research couldn't answer (user intent, product priorities, failure modes)
- The plan contains explicit open questions or "TBD" sections

**When to skip it:**
- The plan is straightforward and well-scoped
- The user already provided detailed requirements
- Decisions can be confidently inferred from existing codebase patterns

**How to run it:**

1. Read the plan and identify every ambiguity, open question, assumption, or decision point where the user's input would change the approach.
2. Group related questions together. Prioritize questions where the answer would significantly change the implementation — skip anything obvious or inferable from the codebase.
3. Ask 2-4 questions at a time using `AskUserQuestion`. Questions should be specific and non-obvious. Bad: "What database should we use?" Good: "The notification queries will fan out per-user — should we denormalize into a per-user table for read speed, or keep the normalized schema and add an index?"
4. Continue interviewing until all ambiguities are resolved. Typically 2-4 rounds.
5. Integrate every answer directly into the relevant section of the plan — update the approach, code snippets, trade-offs, and task list accordingly. Don't append a Q&A transcript; weave the decisions into the plan as if they were always part of it.

**Do NOT implement yet.** The interview refines the plan — it doesn't replace the annotation cycle.

## Phase Exit

End the plan with: *"Ready for your review. Add any inline notes and I'll update the plan accordingly."*

If the plan has unresolved ambiguities, suggest: *"There are some open questions in the plan. Want me to interview you on them before you annotate?"*

**Do NOT implement yet.**
