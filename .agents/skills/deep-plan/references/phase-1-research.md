# Phase 1: Research

Deep-read the relevant codebase. Surface-level skimming is not acceptable.

## Process

1. Read every file in the relevant module/folder — not just entry points
2. Trace data flows, understand side effects, identify implicit contracts
3. Note existing patterns: caching layers, ORM conventions, shared utilities, API signatures
4. Write findings to `.claude/research.md` using the template at `assets/templates/research-template.md`

## What the Research Document Must Cover

- What the system does and how
- Key abstractions and their responsibilities
- Data flow through the system
- Existing patterns that new code must respect
- Edge cases, invariants, and implicit assumptions
- File paths for every major component discussed

## Depth Signals

Without explicit depth signals, the tendency is to skim — read a function signature and move on. The research must go deeper:

- Read function bodies, not just signatures
- Follow calls across files to understand the full chain
- Check how errors propagate
- Look at what's cached, what's lazy-loaded, what's eager
- Note any implicit ordering dependencies

## Stop Condition

The document should be detailed enough that the user can verify you actually understood the system. If you can't explain *why* something is done a certain way, you haven't read deeply enough.

## Example Prompts

```
read this folder in depth, understand how it works deeply, what it does and all
its specificities. when that's done, write a detailed report of your learnings
and findings in .claude/research.md
```

```
study the notification system in great details, understand the intricacies of it
and write a detailed .claude/research.md document with everything there is to
know about how notifications work
```

```
go through the task scheduling flow, understand it deeply and look for potential
bugs. there definitely are bugs in the system as it sometimes runs tasks that
should have been cancelled. keep researching the flow until you find all the
bugs, don't stop until all the bugs are found. when you're done, write a
detailed report of your findings in .claude/research.md
```

## Phase Exit

Write `.claude/research.md` and tell the user it's ready for review. Do NOT proceed to planning until the user says to.
