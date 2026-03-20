#!/usr/bin/env python3
"""Scan a plan file for unaddressed user annotations.

Detects inline notes the user added that haven't been resolved yet.
Annotations are lines that look like user-inserted comments rather than
part of the original plan structure.

Usage:
    python3 check_annotations.py <plan-file>
    python3 check_annotations.py .claude/plan.md
"""

import re
import sys
from pathlib import Path

ANNOTATION_PATTERNS = [
    # Explicit markers
    (r'^\s*(?:NOTE|NB|FIXME|TODO|CHANGE|WRONG|NO)[\s:—\-]', 'explicit_marker'),
    # Lines starting with common correction language
    (r'^\s*(?:not |don\'t |remove |use |this should |this is wrong|actually |instead )', 'correction'),
    # Lines wrapped in brackets or parens that look like inline notes
    (r'^\s*\[(?!x?\])[^\]]{5,}\]', 'bracketed_note'),
    # Lines starting with "^" (common annotation style)
    (r'^\s*\^', 'caret_note'),
    # Lines starting with "> " that aren't blockquotes in context
    (r'^\s*>\s+(?:NOTE|NB|FIXME|TODO|CHANGE|WRONG|NO)', 'quoted_marker'),
]

COMPILED = [(re.compile(p, re.IGNORECASE), label) for p, label in ANNOTATION_PATTERNS]


def find_annotations(filepath: str) -> list[dict]:
    path = Path(filepath)
    if not path.exists():
        print(f"Error: {filepath} not found", file=sys.stderr)
        sys.exit(1)

    lines = path.read_text().splitlines()
    annotations = []

    in_code_block = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        if stripped.startswith('```'):
            in_code_block = not in_code_block
            continue

        if in_code_block:
            continue

        for pattern, label in COMPILED:
            if pattern.search(stripped):
                annotations.append({
                    'line': i,
                    'type': label,
                    'text': stripped,
                })
                break

    return annotations


def main():
    if len(sys.argv) != 2:
        print("Usage: check_annotations.py <plan-file>", file=sys.stderr)
        sys.exit(1)

    annotations = find_annotations(sys.argv[1])

    if not annotations:
        print("No unaddressed annotations found.")
        sys.exit(0)

    print(f"Found {len(annotations)} potential annotation(s):\n")
    for a in annotations:
        print(f"  Line {a['line']} [{a['type']}]: {a['text']}")

    sys.exit(1)


if __name__ == '__main__':
    main()
