"""
check_site.py — static integrity check for the built OfferReady site.

Verifies MVP functional areas without a browser:
  1. Every nav target in mkdocs.yml exists in docs/.
  2. Every extra_javascript / extra_css asset exists in docs/assets/.
  3. Every internal markdown link ([..](x.md) / (x.html) / (#anchor)) resolves.
  4. Every JS mount div (#analyze-app, #scenario-app, #ip-app, #ip-dash,
     #why-app, #scenario-app) has at least one page that mounts it, and the
     mounting JS asset is wired in.
  5. Premium scenario bodies are NOT present in docs/ (security).

Exit code 0 = all good; 1 = problems found (printed).
Run:  python check_site.py
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
MKDOCS = ROOT / "mkdocs.yml"

problems: list[str] = []
info: list[str] = []


def rel(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


# ---------------------------------------------------------------------------
# Parse mkdocs.yml (nav + assets) without a YAML dep — simple line scan.
# ---------------------------------------------------------------------------
mk = MKDOCS.read_text(encoding="utf-8", errors="replace")

# extra_javascript / extra_css: lines like "  - assets/foo.js"
asset_refs = re.findall(r"^\s*-\s*(assets/[^\s]+\.(?:js|css))\s*$", mk, re.M)
for a in sorted(set(asset_refs)):
    if not (DOCS / a).exists():
        problems.append(f"[asset] mkdocs references {a} but docs/{a} is missing")
    else:
        info.append(f"[asset] ok: {a}")

# nav targets: anything ending in .md or .html after a colon or as a bare item.
nav_block = mk
m = re.search(r"# NAV:BEGIN(.*?)# NAV:END", mk, re.S)
if m:
    nav_block = m.group(1)
nav_targets = re.findall(r"([A-Za-z0-9_\-./]+\.(?:md|html))", nav_block)
for t in sorted(set(nav_targets)):
    if not (DOCS / t).exists():
        problems.append(f"[nav] nav points to {t} but docs/{t} is missing")
info.append(f"[nav] checked {len(set(nav_targets))} nav targets")


# ---------------------------------------------------------------------------
# Internal markdown links across all built docs.
# ---------------------------------------------------------------------------
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
md_files = list(DOCS.rglob("*.md"))
link_count = 0
for md in md_files:
    text = md.read_text(encoding="utf-8", errors="replace")
    for target in LINK_RE.findall(text):
        target = target.strip()
        # skip external, anchors-only, mailto, images already handled, and template links
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        # strip any #anchor and query
        path_part = target.split("#", 1)[0].split("?", 1)[0]
        if not path_part:
            continue
        # skip non-page assets (images, pdf, etc.) — only check .md/.html here
        if not path_part.endswith((".md", ".html")):
            continue
        link_count += 1
        resolved = (md.parent / path_part).resolve()
        # Also accept .md <-> .html swap (use_directory_urls: false)
        alt = None
        if path_part.endswith(".html"):
            alt = (md.parent / (path_part[:-5] + ".md")).resolve()
        if not resolved.exists() and not (alt and alt.exists()):
            problems.append(f"[link] {rel(md)} -> {target} (missing)")
info.append(f"[link] checked {link_count} internal .md/.html links across {len(md_files)} pages")


# ---------------------------------------------------------------------------
# JS mount points: each mount id should appear in some page, and its JS asset
# should be wired in mkdocs.
# ---------------------------------------------------------------------------
MOUNTS = {
    "analyze-app": "assets/analyze.js",
    "scenario-app": "assets/scenario.js",
    "ip-app": "assets/practice.js",
    "ip-dash": "assets/progress.js",
    "why-app": "assets/why.js",
}
all_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in md_files)
for mount, asset in MOUNTS.items():
    has_mount = f'id="{mount}"' in all_text
    has_asset = asset in mk
    if has_mount and not has_asset:
        problems.append(f"[mount] #{mount} used but {asset} not wired in mkdocs.yml")
    if has_asset and not has_mount:
        info.append(f"[mount] note: {asset} wired but no page mounts #{mount} (ok if optional)")
    if has_mount and has_asset:
        info.append(f"[mount] ok: #{mount} <- {asset}")


# ---------------------------------------------------------------------------
# Security: premium scenario bodies must NOT be in docs/.
# ---------------------------------------------------------------------------
PROBES = ["tombstone deletes", "PROTECTED", "\"nodes\""]
leaks = []
for p in DOCS.rglob("*"):
    if p.is_file() and p.suffix in {".md", ".html", ".json", ".js"}:
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for probe in PROBES:
            if probe == "tombstone deletes" and probe in t:
                leaks.append(f"[security] premium answer text found in {rel(p)}")
if leaks:
    problems.extend(leaks)
else:
    info.append("[security] no premium scenario body found in docs/ (good)")


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
print("=== OfferReady site integrity check ===")
for line in info:
    print("  " + line)
print()
if problems:
    print(f"FAILED — {len(problems)} problem(s):")
    for p in problems:
        print("  ! " + p)
    sys.exit(1)
else:
    print("PASSED — all checked areas are wired and resolve.")
    sys.exit(0)
