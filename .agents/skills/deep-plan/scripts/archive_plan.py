#!/usr/bin/env python3
"""Archive a completed plan to docs/completed-tasks/.

Moves the plan file to docs/completed-tasks/<slug>.md and optionally
cleans up the research file.

Usage:
    python3 archive_plan.py <plan-file> [--name <slug>] [--cleanup <research-file>]
    python3 archive_plan.py .claude/plan.md --name cursor-pagination --cleanup .claude/research.md
"""

import argparse
import re
import shutil
import sys
from pathlib import Path


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')


def extract_title(filepath: Path) -> str:
    lines = filepath.read_text().splitlines()
    for line in lines:
        if line.startswith('# '):
            return line.lstrip('# ').strip()
    return filepath.stem


def main():
    parser = argparse.ArgumentParser(description='Archive a completed plan')
    parser.add_argument('plan_file', help='Path to the plan file')
    parser.add_argument('--name', help='Slug name for the archive (auto-derived from title if omitted)')
    parser.add_argument('--cleanup', help='Research file to delete after archiving')
    parser.add_argument('--dest', default='docs/completed-tasks', help='Destination directory (default: docs/completed-tasks)')
    args = parser.parse_args()

    plan_path = Path(args.plan_file)
    if not plan_path.exists():
        print(f"Error: {args.plan_file} not found", file=sys.stderr)
        sys.exit(1)

    slug = args.name or slugify(extract_title(plan_path))
    if not slug:
        print("Error: could not determine archive name. Use --name.", file=sys.stderr)
        sys.exit(1)

    dest_dir = Path(args.dest)
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_file = dest_dir / f"{slug}.md"
    if dest_file.exists():
        print(f"Warning: {dest_file} already exists. Overwriting.", file=sys.stderr)

    shutil.move(str(plan_path), str(dest_file))
    print(f"Archived: {plan_path} -> {dest_file}")

    if args.cleanup:
        cleanup_path = Path(args.cleanup)
        if cleanup_path.exists():
            cleanup_path.unlink()
            print(f"Cleaned up: {cleanup_path}")
        else:
            print(f"Cleanup target not found: {cleanup_path}")

    sys.exit(0)


if __name__ == '__main__':
    main()
