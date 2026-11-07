#!/usr/bin/env python3
"""Library freshness check: lists study-library pages whose
"*Last reviewed: <Month> <YYYY>*" line is older than MAX_DAYS (default 90),
oldest first, so they get a refresh. It never edits a page.

    python check_freshness.py            # report, exit 0
    MAX_DAYS=60 python check_freshness.py
In GitHub Actions the report is also written to the job summary.
"""
import os, re, sys
from datetime import date
from pathlib import Path

MAX_DAYS = int(os.environ.get("MAX_DAYS", "90"))
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
LINE = re.compile(r"\*Last reviewed:\s*([A-Za-z]+)\s+(\d{4})\*")


def reviewed(path):
    m = LINE.search(path.read_text(encoding="utf-8", errors="ignore"))
    if not m or m.group(1).lower() not in MONTHS:
        return None
    return date(int(m.group(2)), MONTHS[m.group(1).lower()], 1)


def main(today=None):
    today = today or date.today()
    root = Path(__file__).parent / "content"
    rows = []
    for p in sorted(root.rglob("*.md")):
        d = reviewed(p)
        if d is None:
            continue
        age = (today - d).days
        if age > MAX_DAYS:
            rows.append((age, d, p.relative_to(root).as_posix()))
    rows.sort(reverse=True)
    lines = [f"## Library freshness: {len(rows)} page(s) last reviewed more than {MAX_DAYS} days ago", ""]
    lines += [f"- `{rel}`: last reviewed {d.strftime('%B %Y')} ({age} days)" for age, d, rel in rows] or ["All reviewed pages are fresh."]
    out = "\n".join(lines)
    print(out)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(out + "\n")
    return rows


if __name__ == "__main__":
    main()
    sys.exit(0)
