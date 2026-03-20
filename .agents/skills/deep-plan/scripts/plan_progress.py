#!/usr/bin/env python3
"""Parse a plan file and report task completion progress.

Reads markdown checkboxes (- [ ] and - [x]) and reports progress
by phase and overall.

Usage:
    python3 plan_progress.py <plan-file>
    python3 plan_progress.py .claude/plan.md
"""

import re
import sys
from pathlib import Path

CHECKBOX_DONE = re.compile(r'^\s*-\s*\[x\]\s+(.+)', re.IGNORECASE)
CHECKBOX_TODO = re.compile(r'^\s*-\s*\[\s?\]\s+(.+)')
PHASE_HEADER = re.compile(r'^#{1,3}\s+(.+)')


def parse_progress(filepath: str) -> dict:
    path = Path(filepath)
    if not path.exists():
        print(f"Error: {filepath} not found", file=sys.stderr)
        sys.exit(1)

    lines = path.read_text().splitlines()
    phases = []
    current_phase = None

    for line in lines:
        header_match = PHASE_HEADER.match(line)
        if header_match:
            current_phase = header_match.group(1).strip()
            continue

        done_match = CHECKBOX_DONE.match(line)
        todo_match = CHECKBOX_TODO.match(line)

        if done_match:
            phases.append({
                'phase': current_phase or '(no phase)',
                'task': done_match.group(1).strip(),
                'done': True,
            })
        elif todo_match:
            phases.append({
                'phase': current_phase or '(no phase)',
                'task': todo_match.group(1).strip(),
                'done': False,
            })

    return phases


def main():
    if len(sys.argv) != 2:
        print("Usage: plan_progress.py <plan-file>", file=sys.stderr)
        sys.exit(1)

    tasks = parse_progress(sys.argv[1])

    if not tasks:
        print("No tasks found (no checkboxes in file).")
        sys.exit(0)

    total = len(tasks)
    done = sum(1 for t in tasks if t['done'])
    remaining = total - done

    # Group by phase
    phase_order = []
    phase_map = {}
    for t in tasks:
        p = t['phase']
        if p not in phase_map:
            phase_order.append(p)
            phase_map[p] = {'done': 0, 'total': 0, 'remaining': []}
        phase_map[p]['total'] += 1
        if t['done']:
            phase_map[p]['done'] += 1
        else:
            phase_map[p]['remaining'].append(t['task'])

    pct = (done / total * 100) if total > 0 else 0
    print(f"Progress: {done}/{total} tasks ({pct:.0f}%)\n")

    for phase in phase_order:
        info = phase_map[phase]
        status = "DONE" if info['done'] == info['total'] else f"{info['done']}/{info['total']}"
        print(f"  {phase}: [{status}]")
        for task in info['remaining']:
            print(f"    - [ ] {task}")

    if remaining == 0:
        print("\nAll tasks complete.")
    else:
        print(f"\n{remaining} task(s) remaining.")

    sys.exit(0 if remaining == 0 else 1)


if __name__ == '__main__':
    main()
