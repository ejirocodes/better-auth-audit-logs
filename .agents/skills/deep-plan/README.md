# deep-plan

A structured workflow skill for AI-assisted development. Separates planning from execution to prevent wasted effort.

## What It Does

Research the codebase, write a plan, let the user annotate the plan until it's right, then execute without stopping.

```
Research → Plan → [Interview] → Annotate (1-6x) → Todo List → Implement → Feedback → Archive
```

The core principle: never let the agent write code until you've reviewed and approved a written plan.

## Installation

### Using Skills CLI (Recommended)

Install to any supported coding agent using [npx skills](https://github.com/vercel-labs/skills):

```bash
# Install to Claude Code (global)
npx skills add theclaymethod/deep-plan -g -a claude-code

# Install to multiple agents
npx skills add theclaymethod/deep-plan -g -a claude-code -a cursor -a codex

# Install to all detected agents
npx skills add theclaymethod/deep-plan -g
```

### Manual Installation

```bash
# Clone the repo
git clone https://github.com/theclaymethod/deep-plan.git ~/dev/deep-plan

# Symlink to Claude Code skills directory
ln -s ~/dev/deep-plan ~/.claude/skills/deep-plan

# Or symlink to commands (for /deep-plan invocation)
ln -s ~/dev/deep-plan/SKILL.md ~/.claude/commands/deep-plan.md
```

### Standalone Scripts

The Python utility scripts work independently:

```bash
# Find unaddressed annotations in a plan
python3 scripts/check_annotations.py .claude/plan.md

# Check task completion progress
python3 scripts/plan_progress.py .claude/plan.md

# Archive a completed plan
python3 scripts/archive_plan.py .claude/plan.md --name cursor-pagination --cleanup .claude/research.md
```

## Usage

### Start a Session

```
/deep-plan
```

Then describe what you want to build. The skill guides you through each phase.

### The Workflow

**Phase 1: Research.** The agent deep-reads the relevant codebase and writes findings to `.claude/research.md`. You review it to verify the agent actually understood the system.

**Phase 2: Plan.** The agent writes a detailed implementation plan to `.claude/plan.md` with code snippets, file paths, and trade-offs.

**Phase 2b: Interview (optional).** If the plan has ambiguities the agent can't resolve from the codebase alone, it runs an interactive Q&A before handing the plan to you. Covers architectural choices (sync vs async, data modeling, migration strategy), API design, performance trade-offs, and UI/UX decisions. Answers get woven directly into the plan, not appended as a transcript. Saves annotation cycles by resolving open questions upfront.

**Phase 3: Annotate.** You open the plan in your editor and add inline notes directly into the document. Corrections, rejections, domain knowledge, scope cuts. Then tell the agent to update the plan. Repeat 1-6 times until you're satisfied.

**Phase 4: Todo List.** The agent adds a granular task breakdown with checkboxes to the plan.

**Phase 5: Implement.** The agent executes the entire plan, marking tasks complete as it goes. Runs typecheck continuously.

**Phase 6: Feedback.** You test, find issues, fire off terse corrections. The agent has full context so short messages work.

**Phase 7: Archive.** The completed plan moves to `docs/completed-tasks/` for project history.

### Example Annotations

Notes you'd add directly into plan.md:

```
use drizzle:generate for migrations, not raw SQL
```
```
no, this should be a PATCH, not a PUT
```
```
remove this section entirely, we don't need caching here
```
```
this is wrong, visibility should be on the list itself, not individual items
```

### Example Implementation Prompt

```
implement it all. when you're done with a task or phase, mark it as completed
in the plan document. do not stop until all tasks and phases are completed.
do not add unnecessary comments or jsdocs, do not use any or unknown types.
continuously run typecheck to make sure you're not introducing new issues.
```

## Project Structure

```
deep-plan/
├── SKILL.md                           # Main skill file (lean router)
├── README.md                          # This file
├── references/
│   ├── phase-1-research.md            # Research phase instructions
│   ├── phase-2-plan.md                # Planning phase instructions
│   ├── phase-3-annotate.md            # Annotation cycle instructions
│   ├── phase-4-todo.md                # Todo list phase instructions
│   ├── phase-5-implement.md           # Implementation phase instructions
│   ├── phase-6-feedback.md            # Feedback phase instructions
│   ├── phase-7-archive.md             # Archive phase instructions
│   └── annotation-guide.md            # How to write effective annotations
├── scripts/
│   ├── check_annotations.py           # Find unaddressed user notes
│   ├── plan_progress.py               # Task completion progress (X/Y)
│   └── archive_plan.py                # Move plan to docs/completed-tasks/
└── assets/
    └── templates/
        ├── research-template.md       # Skeleton for research output
        └── plan-template.md           # Skeleton for plan output
```

## Supported Agents

This skill follows the [Agent Skills specification](https://agentskills.io) and works with:

- Claude Code
- Cursor
- Codex
- OpenCode
- Cline
- Roo Code
- And [35+ other agents](https://github.com/vercel-labs/skills#supported-agents)

## Philosophy

Most developers type a prompt, sometimes use plan mode, fix the errors, repeat. The results fall apart for anything non-trivial.

This workflow fixes that by separating thinking from typing:

- **Research** prevents ignorant changes (the agent understands the system before proposing anything)
- **The plan** prevents wrong changes (every decision is explicit and reviewable)
- **The annotation cycle** injects your judgement (product priorities, domain knowledge, trade-offs)
- **The implementation command** lets the agent run without interruption once every decision is made

Three rounds of "I added notes, update the plan" can turn a generic implementation plan into one that fits the existing system exactly.

## Credit

This workflow is based on [How I Use Claude Code](https://boristane.com/blog/how-i-use-claude-code/) by [Boris Tane](https://boristane.com).

## Requirements

- Python 3.8+
- Any supported coding agent

## License

MIT
