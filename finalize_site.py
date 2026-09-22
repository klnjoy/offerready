"""
Copy the heavy module files (PDFs, rendered notebooks, diagrams) into the built
site/ INCREMENTALLY — only files that are new or changed size.

mkdocs is configured to EXCLUDE Course-Modules/files/ from its build (see
exclude_docs in mkdocs.yml), so `mkdocs build` stays fast (markdown only). This
script tops up the built site with the large assets without re-copying the
~470 MB every time.

Run order:
    python sync_docs.py
    python -m mkdocs build --clean
    python finalize_site.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "docs" / "Course-Modules" / "files"
DST = ROOT / "site" / "Course-Modules" / "files"
SITE = ROOT / "site"

# Social/SEO meta injected into every built page's <head>. No new dependency,
# no theme override — just a post-build string insert. Material already emits
# <meta name="description"> and a canonical link from site_description/site_url.
_OG_TITLE = "OfferReady — Production AI Engineering &amp; FDE Interview Prep"
_OG_DESC = ("Learn the technology, build the system, defend your decisions, and "
            "land the offer. Advanced question banks, model answers, and "
            "interactive practice for AI/GenAI, data, and FDE interviews.")
_OG_URL = "https://klnjoy.github.io/offerready/"
_OG_IMG = _OG_URL + "assets/logo.svg"

_META_MARK = "<!--offerready-social-meta-->"
_META = (
    f'{_META_MARK}'
    f'<meta property="og:type" content="website">'
    f'<meta property="og:site_name" content="OfferReady">'
    f'<meta property="og:title" content="{_OG_TITLE}">'
    f'<meta property="og:description" content="{_OG_DESC}">'
    f'<meta property="og:url" content="{_OG_URL}">'
    f'<meta property="og:image" content="{_OG_IMG}">'
    f'<meta name="twitter:card" content="summary">'
    f'<meta name="twitter:title" content="{_OG_TITLE}">'
    f'<meta name="twitter:description" content="{_OG_DESC}">'
    f'<meta name="twitter:image" content="{_OG_IMG}">'
)


def inject_social_meta() -> int:
    """Insert Open Graph / Twitter card meta into every built HTML <head>.
    Idempotent via a marker comment. Returns count of files updated."""
    if not SITE.exists():
        return 0
    updated = 0
    for html in SITE.rglob("*.html"):
        # Skip the heavy copied module assets (rendered notebooks etc.).
        if "Course-Modules" in html.parts and "files" in html.parts:
            continue
        try:
            text = html.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if _META_MARK in text or "</head>" not in text:
            continue
        new = text.replace("</head>", _META + "</head>", 1)
        if new != text:
            try:
                html.write_text(new, encoding="utf-8")
                updated += 1
            except OSError:
                pass
    return updated


def main() -> None:
    meta_updated = inject_social_meta()
    print(f"Social meta injected into {meta_updated} pages.")
    if not SRC.exists():
        print(f"No module files to copy (missing {SRC}).")
        return
    DST.mkdir(parents=True, exist_ok=True)
    copied = skipped = 0
    for src in SRC.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(SRC)
        dst = DST / rel
        try:
            if dst.exists() and dst.stat().st_size == src.stat().st_size:
                skipped += 1
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
        except OSError as exc:
            print(f"WARNING: could not copy {rel}: {exc}")
    print(f"Site files synced: {copied} copied, {skipped} unchanged (skipped).")


if __name__ == "__main__":
    main()
