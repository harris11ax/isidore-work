#!/usr/bin/env python3
"""Remove local filesystem paths from a working tree that may be about to be committed.

Safe to run once per commit by `git filter-branch --tree-filter`, so it is
idempotent and never fails on a tree where the leaked paths are already gone.

What it removes:
  * the `sourcePath` member of every record in src/data/projects.json
  * any line under src/ that mentions `sourcePath` or a Windows drive path
  * any line anywhere in the tracked tree that contains a real drive-letter path
    (C:\\Users\\..., C:/Users/..., G:\\My Drive\\...)

Usage (from the repository root):
    python scripts/purge-local-paths.py
"""
import re
import sys
from pathlib import Path

JSON_FIELD = re.compile(r'\n[ \t]*"sourcePath"[ \t]*:[ \t]*"(?:[^"\\]|\\.)*",?')
# a drive letter, a separator, then a path component - deliberately does NOT match
# this file's own pattern literals, so the tool never eats itself
DRIVE_PATH = re.compile(r"[A-Za-z]:[\\/][A-Za-z]")
TEXT_SUFFIXES = {".json", ".ts", ".tsx", ".astro", ".md", ".css", ".mjs", ".js", ".py", ".sh", ".txt", ".yml", ".yaml"}
SKIP_DIRS = {".git", "node_modules", "dist", ".astro", ".wrangler", "portfolio_db", "scrape_live"}
# this tool documents the shapes it looks for, so it must never be swept itself
SKIP_FILES = {"purge-local-paths.py"}

if not Path("src").is_dir():
    sys.exit("no src/ directory here - run from the repository root")

changed = []

projects = Path("src/data/projects.json")
if projects.is_file():
    text = projects.read_text(encoding="utf-8")
    new = JSON_FIELD.sub("", text)
    if new != text:
        projects.write_text(new, encoding="utf-8")
        changed.append((projects, text.count('"sourcePath"'), new.count('"sourcePath"')))


def targets():
    for f in Path(".").rglob("*"):
        if not f.is_file() or f.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in f.parts) or f.name in SKIP_FILES:
            continue
        yield f


for f in sorted(targets()):
    if f == projects:
        continue
    text = f.read_text(encoding="utf-8", errors="ignore")
    in_src = f.parts[0] == "src"
    drop = DRIVE_PATH
    if in_src and ("sourcePath" in text or DRIVE_PATH.search(text)):
        kept = [ln for ln in text.splitlines(True) if "sourcePath" not in ln and not DRIVE_PATH.search(ln)]
    elif DRIVE_PATH.search(text):
        kept = [ln for ln in text.splitlines(True) if not drop.search(ln)]
    else:
        continue
    new = "".join(kept)
    if new != text:
        f.write_text(new, encoding="utf-8")
        changed.append((f, len(text.splitlines()), len(kept)))

for path, before, after in changed:
    print(f"purged {path}: {before} -> {after} lines")
print(f"done - {len(changed)} file(s) changed")
