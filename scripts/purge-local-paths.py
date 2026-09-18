#!/usr/bin/env python3
"""Remove local filesystem paths from every file under src/ in the CURRENT tree.

Written to be safe to run once per commit by `git filter-branch --tree-filter`,
so it must be idempotent and must never fail on a tree where the field is gone.

What it removes:
  * the `sourcePath` member of every record in src/data/projects.json
  * the `sourcePath` member of the Project interface in src/lib/projects.ts
  * any line in a src/ text file containing a Windows drive path (C:\\...)

Usage (from the repository root):
    python scripts/purge-local-paths.py
"""
import re
import sys
from pathlib import Path

JSON_FIELD = re.compile(r'\n[ \t]*"sourcePath"[ \t]*:[ \t]*"(?:[^"\\]|\\.)*",?')
DRIVE_PATH = re.compile(r"[A-Za-z]:\\")
TEXT_SUFFIXES = {".json", ".ts", ".tsx", ".astro", ".md", ".css", ".mjs", ".js"}

SRC = Path("src")
if not SRC.is_dir():
    sys.exit("no src/ directory here - run from the repository root")

changed = []

projects = SRC / "data" / "projects.json"
if projects.is_file():
    text = projects.read_text(encoding="utf-8")
    new = JSON_FIELD.sub("", text)
    if new != text:
        projects.write_text(new, encoding="utf-8")
        changed.append((projects, text.count('"sourcePath"'), new.count('"sourcePath"')))

for f in sorted(SRC.rglob("*")):
    if not f.is_file() or f.suffix not in TEXT_SUFFIXES:
        continue
    if f == projects:
        continue
    text = f.read_text(encoding="utf-8", errors="ignore")
    if "sourcePath" not in text and not DRIVE_PATH.search(text):
        continue
    kept = [ln for ln in text.splitlines(True) if "sourcePath" not in ln and not DRIVE_PATH.search(ln)]
    new = "".join(kept)
    if new != text:
        f.write_text(new, encoding="utf-8")
        changed.append((f, len(text.splitlines()), len(kept)))

for path, before, after in changed:
    print(f"purged {path}: {before} -> {after}")
print(f"done - {len(changed)} file(s) changed")
