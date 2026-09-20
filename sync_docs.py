"""
Build the docs/ folder for this MkDocs site.

Content comes from three places:

1. content/            -- pages you author by hand (Technologies, GenAI Topics).
                          Copied verbatim into docs/.
2. Source roots        -- existing personal *.md (study book, interview prep,
                          project READMEs). Copied and grouped by purpose.
3. extracted/ modules  -- course-module folders (PDFs/notebooks/etc). One
                          generated "catalog" page each, mapped under the
                          matching GenAI topic.

The script also regenerates:
  - docs/index.md      -- a card-grid landing page.
  - the nav: block in mkdocs.yml (between # NAV:BEGIN / # NAV:END markers),
    with icons on each top-level section.

Run:  python sync_docs.py
Then: python -m mkdocs serve   (or  build --clean)
"""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths & configuration
# ---------------------------------------------------------------------------

SITE_ROOT = Path(__file__).resolve().parent
DOCS_DIR = SITE_ROOT / "docs"
CONTENT_DIR = SITE_ROOT / "content"          # hand-authored pages
MKDOCS_YML = SITE_ROOT / "mkdocs.yml"

# Local source of the personal GenAI study material. This is a machine-specific
# path, so it's read from an environment variable (set GENAI_SOURCE_ROOT) with a
# sensible local fallback. Nothing here is committed-specific.
GENAI_ROOT = Path(
    os.environ.get("GENAI_SOURCE_ROOT")
    or (Path.home() / "GENAI-AGENTICAI")
)
EXTRACTED_DIR = GENAI_ROOT / "extracted"

# Personal *.md source roots (label used only for dest folder name).
#   - personal-docs/  : in-repo, self-authored study/interview/project docs
#                       (always present; drives Interview Guide + Projects).
#   - GENAI_ROOT      : optional external study book + course modules; only used
#                       locally when GENAI_SOURCE_ROOT is set. Absent in CI.
SOURCE_ROOTS: list[tuple[str, Path]] = [
    ("Personal-SourceCode", SITE_ROOT / "personal-docs"),
    ("GENAI-AGENTICAI", GENAI_ROOT),
]

MODULES_SECTION = "Course-Modules"

# Files/folders under docs/ that are NOT regenerated (survive a sync).
KEEP_IN_DOCS = {"assets"}

# Never copy markdown living inside these directory names.
EXCLUDE_DIR_NAMES = {
    ".git", ".venv", "venv", "node_modules",
    "site", "genai-docs-site",
    "weeklystatus_2026",     # office/work
    "extracted",             # handled as module catalog pages
    "content",               # copied separately, verbatim
    "aws-transfer-family",   # setup/infra — not GenAI, excluded
    "data-strategy-website", # marketing/LinkedIn content — not GenAI study
    "genai-poc",             # rendered fully by build_code_project_pages();
                             # skip generic *.md sync to avoid a duplicate
                             # README-only "…Learning" page in the nav.
}

# Module folder-name fragments to skip entirely.
EXCLUDE_MODULE_FRAGMENTS = ("DAILY-LOGS", "DAILY RECORDINGS")

# Specific markdown files never copied into the site. Add a filename here to keep
# it local-only (e.g. anything with confidential/employer-specific material).
EXCLUDE_FILE_NAMES: set[str] = set()

# Files copied into docs/ but kept OUT of the auto-generated nav catalog because
# they're placed explicitly elsewhere in the nav (avoids duplicate entries).
COPY_NO_CATALOG: set[str] = {
    "Pricing.md",
    "Lab_Scenario_Drills.md",
    "Lab_LiveCoding_Drills.md",
    "Lab_Hackathon_Builds.md",
}


# ---------------------------------------------------------------------------
# Front-page / nav categories for the *readable* personal docs
# ---------------------------------------------------------------------------

# (name, icon shortcode, keyword matchers)
CATEGORIES: list[tuple[str, str, tuple[str, ...]]] = [
    ("Study Guide", ":material-book-open-variant:",
     ("study-book", "study book", "complete-study")),
    ("Interview Guide", ":material-account-tie:",
     ("interview", "coding-interview", "qa", "fde", "livecoding")),
    ("Projects & POCs", ":material-rocket-launch:",
     ("poc", "project", "architecture", "sql-assistant", "procurement",
      "langchain", "langgraph", "lambda", "crud", "knowledge base",
      "knowledge-base", "agentcore", "bedrock", "bot")),
    ("Setup & Infrastructure", ":material-cog:",
     ("setup", "transfer-family", "deployment", "infra")),
]
CATEGORY_ICONS = {name: icon for name, icon, _ in CATEGORIES}
CATEGORY_ICONS["More"] = ":material-dots-horizontal:"

# Clean, ordered nav labels for specific pages (by dest filename). Lets us show
# short readable labels in a deliberate order instead of long auto-titles.
# (rel_dest basename -> (order, short label)).
NAV_LABEL_OVERRIDES: dict[str, tuple[int, str]] = {
    # Interview Guide — landing + practice first, then role-specific,
    # then per-technology advanced Q&A banks.
    "Interview_Guide_Overview.md": (0, "Overview & Study Path"),
    "Interview_Practice.md": (1, "Practice (Mock Session)"),
    "Interview_Progress.md": (2, "Progress Dashboard"),
    "GenAI_Interview_QA.md": (3, "GenAI Interview Q&A"),
    "Forward_Deployed_Engineer_Interview_QA.md": (4, "FDE Interview Q&A"),
    "FDE_Coding_Interview_Prep.md": (5, "FDE Coding Prep"),
    "FDE_LiveCoding_Scenarios_Prep.md": (6, "FDE Live-Coding & Scenarios"),
    "Interview_Prep_Google_Cloud_Delivery_Lead.md": (7, "Cloud Delivery Lead Prep"),
    # Per-technology / role advanced & scenario-based Q&A.
    "AI_Engineer_Interview_QA.md": (8, "AI Engineer Interview Q&A"),
    "Agents_Interview_QA.md": (9, "Agentic AI / Agents Interview Q&A"),
    "LangChain_LangGraph_Interview_QA.md": (10, "LangChain / LangGraph Interview Q&A"),
    "MCP_Interview_QA.md": (11, "MCP Interview Q&A"),
    "SQL_Interview_QA.md": (12, "SQL Interview Q&A"),
    "DataEngineering_Interview_QA.md": (13, "Data Engineering Interview Q&A"),
    "Snowflake_Interview_QA.md": (14, "Snowflake Interview Q&A"),
    "Databricks_Interview_QA.md": (15, "Databricks Interview Q&A"),
    "dbt_Interview_QA.md": (16, "dbt Interview Q&A"),
    "Python_Interview_QA.md": (17, "Python Interview Q&A"),
    "AWS_Interview_QA.md": (18, "AWS Interview Q&A"),
    "DevOps_Interview_QA.md": (19, "DevOps Interview Q&A"),
    "Behavioral_STAR_Interview_QA.md": (20, "Behavioral / STAR Interview Q&A"),
    # Flagship interview-training exercises.
    "Interview_Requirements_to_Production.md": (21, "Requirements → Production"),
    "Interview_Production_Incidents.md": (22, "Production Incident Interviews"),
    "Interview_Why_Chains.md": (23, "The Interviewer Keeps Asking Why"),
}


def categorize(title: str, rel_dest: str) -> str:
    hay = f"{title} {rel_dest}".lower()
    for name, _icon, keywords in CATEGORIES:
        if any(kw in hay for kw in keywords):
            return name
    return "More"


# ---------------------------------------------------------------------------
# Map course modules -> GenAI topic folders (under content/GenAI-Topics/<slug>)
# ---------------------------------------------------------------------------

# module title fragment -> topic slug (a module can be the "related module" for
# multiple topics; RAG covers vector DBs too, handled in inject_related_modules)
MODULE_TO_TOPIC = {
    "PROMPT-ENGINEERING": "prompt-engineering",
    "RAG": "rag",
    "LANGCHAIN": "langchain",
    "LANG-GRAPH": "langgraph",
    "LANGGRAPH": "langgraph",
    "MCP": "mcp",
    "BEDROCK": "bedrock",
    "AGENTCORE": "agentcore",
    "GRAPHDB": "graph-db",
    "GRAPH-DB": "graph-db",
}

# Topic (slug, display, icon, one-line description), in nav order.
TOPICS: list[tuple[str, str, str, str]] = [
    ("llm-fundamentals", "LLM Fundamentals", ":material-school:",
     "Tokens, sampling, embeddings, context windows, fine-tune vs RAG."),
    ("prompt-engineering", "Prompt Engineering", ":material-text-box-edit:",
     "Patterns for reliable LLM output: few-shot, CoT, structured output."),
    ("context-engineering", "Context Engineering", ":material-window-restore:",
     "Managing the context window: memory, compaction, retrieval budgets."),
    ("rag", "RAG", ":material-database-search:",
     "Ground models in your data: chunking, embeddings, retrieval."),
    ("retrieval-tuning", "Retrieval Tuning", ":material-tune:",
     "Top-K, filtering vs reranking — getting retrieval right."),
    ("embeddings", "Embedding Models", ":material-dots-hexagon:",
     "Choosing and using embedding models; MTEB, dimensions."),
    ("vector-db", "Vector DB", ":material-vector-triangle:",
     "Embeddings, indexes (HNSW/IVF), similarity search."),
    ("graph-db", "Graph DB", ":material-graph-outline:",
     "Knowledge graphs, Cypher/Gremlin, and GraphRAG."),
    ("langchain", "LangChain", ":material-link-variant:",
     "Chains, tools, memory, and retrievers for LLM apps."),
    ("langgraph", "LangGraph", ":material-graph:",
     "Stateful, multi-step agent workflows as graphs."),
    ("mcp", "MCP", ":material-connection:",
     "Model Context Protocol: connect LLMs to tools and data."),
    ("agent-engineering", "Agent Engineering", ":material-robot-industrial:",
     "Agent patterns, tool design, multi-agent, reliability."),
    ("agent-principles", "Building Agents — Deep Dive", ":material-robot-industrial:",
     "Principles + patterns with code, trade-offs, and anti-patterns."),
    ("a2a", "A2A Communication", ":material-account-switch:",
     "Agent-to-agent coordination; MCP vs A2A."),
    ("agentcore", "AgentCore", ":material-account-cog:",
     "Build, deploy, and govern autonomous agents (AWS)."),
    ("bedrock", "Bedrock", ":material-aws:",
     "AWS managed foundation models, knowledge bases, guardrails."),
    ("observability", "Observability & Eval", ":material-chart-line:",
     "Tracing, LLM-as-judge, metrics, guardrails, monitoring."),
    ("reliability", "Reliability & Distributed Systems", ":material-shield-refresh:",
     "Retries, circuit breakers, idempotency, and AI failure modes."),
    ("llmops", "LLMOps / Deployment", ":material-cog-sync:",
     "Serving, scaling, caching, cost, and lifecycle."),
    ("kubernetes", "Kubernetes & Containers", ":material-kubernetes:",
     "Docker, pods, autoscaling, and serving models / GPUs."),
    ("devops-ai", "DevOps for AI", ":material-infinity:",
     "CI/CD, IaC, Kiro-assisted dev + Jenkins, canary/rollback."),
    ("cost-optimization", "Cost Optimization", ":material-cash-multiple:",
     "Cut LLM cost: routing, caching, budgeting, right-sizing."),
    ("trends", "Trends & Market (2026)", ":material-trending-up:",
     "Current models, agent protocols, RAG patterns, and the hiring market."),
]

# Authored project/case-study pages under content/Projects/<slug>/index.md
# (slug, display, icon, description).
PROJECTS_AUTHORED: list[tuple[str, str, str, str]] = [
    ("data-migration", "Data Migration (Oracle to Snowflake)",
     ":material-database-import:",
     "DMS to S3 to Snowpipe to CDC merge, secure views, SOX validation."),
]

# Code projects rendered as pages with each source file embedded inline.
# (slug, display, icon, description, source folder, glob patterns to embed)
CODE_PROJECTS: list[tuple[str, str, str, str, Path, tuple[str, ...]]] = [
    ("genai-poc", "GenAI POC (LangChain & LangGraph)",
     ":material-language-python:",
     "8 runnable scripts: LLM calls, RAG, LangGraph agents, multi-agent.",
     SITE_ROOT / "personal-docs" / "genai-poc",
     ("*.py", "requirements.txt", ".env.example")),
]


# Authored Documentation pages under content/Documentation/<slug>/index.md
# (slug, display, icon, description), in nav order.
DOCUMENTATION: list[tuple[str, str, str, str]] = [
    ("architecture-overview", "Architecture Overview", ":material-sitemap:",
     "How the pieces fit into a full GenAI application."),
    ("rag-flow", "RAG Flow", ":material-database-search:",
     "End-to-end retrieval-augmented generation, step by step."),
    ("agent-workflow", "Agent Workflow", ":material-robot:",
     "The plan-act-observe loop and control patterns."),
    ("model-selection", "Model Selection Guide", ":material-select-compare:",
     "Choosing the right model for cost, quality, latency."),
    ("prompt-best-practices", "Prompt Best Practices", ":material-text-box-check:",
     "Reliable prompting patterns and anti-patterns."),
    ("security-governance", "Security & Governance", ":material-shield-lock:",
     "Guardrails, data protection, and safe GenAI."),
    ("troubleshooting", "Troubleshooting", ":material-wrench:",
     "Common failures and how to diagnose them."),
    ("faq", "FAQ", ":material-help-circle:",
     "Quick answers to common questions."),
]

# Authored Setup Guides under content/Setup-Guides/<slug>/index.md.
SETUP_GUIDES: list[tuple[str, str, str, str]] = [
    ("local-environment", "Local Environment", ":material-laptop:",
     "Python, venv, keys, project layout."),
    ("llm-access", "LLM Access", ":material-brain:",
     "Bedrock, OpenAI, or local Ollama — first call."),
    ("vector-db-setup", "Vector DB Setup", ":material-vector-triangle:",
     "Stand up pgvector / Chroma / FAISS."),
    ("first-rag", "First RAG App", ":material-database-search:",
     "Ingest docs, retrieve, answer with citations."),
    ("first-agent", "First Agent", ":material-robot:",
     "A tool-using agent loop, step by step."),
]

# Authored Enterprise pages under content/Enterprise/<slug>/index.md.
ENTERPRISE: list[tuple[str, str, str, str]] = [
    ("security-architecture", "Security Architecture", ":material-security:",
     "End-to-end security for GenAI systems."),
    ("rbac", "RBAC Model", ":material-account-key:",
     "Roles, permissions, and least privilege."),
    ("audit-logging", "Audit Logging", ":material-file-document-multiple:",
     "What to log and how, for accountability."),
    ("monitoring", "Monitoring & Observability", ":material-monitor-dashboard:",
     "Metrics, tracing, alerting for LLM apps."),
    ("compliance", "Compliance", ":material-scale-balance:",
     "GDPR, SOC 2, and regulated-industry considerations."),
    ("reference-architectures", "Reference Architectures",
     ":material-cloud-braces:",
     "AWS, Azure, GCP, and Snowflake blueprints."),
]


# Technology (slug, display, icon, one-line description), in nav order.
TECHNOLOGIES: list[tuple[str, str, str, str]] = [
    ("snowflake", "Snowflake", ":material-snowflake:",
     "Warehousing, SQL, Cortex AI, performance, and governance."),
    ("databricks", "Databricks", ":material-database:",
     "Lakehouse, Spark, Delta, Unity Catalog, Mosaic AI."),
    ("dbt", "dbt", ":material-cube-outline:",
     "Models, tests, sources, macros — analytics engineering."),
    ("fastapi", "FastAPI", ":material-lightning-bolt:",
     "Python APIs: async, Pydantic, serving GenAI endpoints."),
    ("aws", "AWS", ":material-aws:",
     "Lambda, S3, Bedrock, IAM, and deployment patterns."),
]


def topic_for_module(title: str) -> str | None:
    upper = title.upper()
    for frag, slug in MODULE_TO_TOPIC.items():
        if frag in upper:
            return slug
    return None


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDE_DIR_NAMES for part in path.parts)


def first_heading(md_path: Path) -> str:
    try:
        with md_path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = re.match(r"^\s{0,3}#{1,2}\s+(.*\S)\s*$", line)
                if m:
                    return m.group(1).strip()
    except OSError:
        pass
    return md_path.stem.replace("_", " ").replace("-", " ").strip()


def module_title(name: str) -> str:
    return re.sub(r"-\d{8}T\d{6}Z-\d+-\d+$", "", name)


def module_slug(title: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower() or "module"


def should_catalog_module(name: str) -> bool:
    upper = name.upper()
    return not any(frag in upper for frag in EXCLUDE_MODULE_FRAGMENTS)


def human_size(num: int) -> str:
    size = float(num)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{num} B"


def nav_label(title: str) -> str:
    """Clean a title for a YAML nav label; quote if it has special chars."""
    label = re.sub(r"^[^\w(]+", "", title).strip() or title.strip()
    if any(c in label for c in ":#{}[],&*!|>'\"%@`"):
        label = '"' + label.replace('"', "'") + '"'
    return label


EXT_LABELS = {
    ".pdf": "PDFs", ".docx": "Word documents", ".doc": "Word documents",
    ".pptx": "Slide decks", ".ppt": "Slide decks",
    ".ipynb": "Jupyter notebooks", ".py": "Python scripts", ".md": "Markdown",
    ".html": "HTML", ".htm": "HTML", ".txt": "Text files", ".csv": "CSV data",
    ".json": "JSON", ".jpg": "Images", ".jpeg": "Images", ".png": "Images",
    ".gif": "Images", ".drawio": "Diagrams", ".zip": "Nested archives",
}


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

def clean_generated() -> None:
    """Remove generated markdown but PRESERVE hand-maintained assets and the
    expensive Course-Modules/files/ tree (so the incremental copy can skip it —
    otherwise every sync re-reads ~470 MB from OneDrive)."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    modules_dir = DOCS_DIR / MODULES_SECTION
    for child in DOCS_DIR.iterdir():
        if child.name in KEEP_IN_DOCS:
            continue
        if child == modules_dir and child.is_dir():
            # If there's no external source to regenerate module pages from
            # (e.g. the public CI build), preserve the committed Course-Modules
            # pages entirely — deleting them would lose content we can't rebuild.
            if not EXTRACTED_DIR.exists():
                continue
            # Otherwise delete only the generated .md catalog pages; keep files/.
            for sub in child.iterdir():
                if sub.name == "files":
                    continue
                if sub.is_dir():
                    shutil.rmtree(sub, ignore_errors=True)
                else:
                    sub.unlink(missing_ok=True)
            continue
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)


def copy_authored_content() -> None:
    """Copy content/ verbatim into docs/ (Technologies, GenAI-Topics, ...)."""
    if not CONTENT_DIR.exists():
        print(f"WARNING: content folder not found: {CONTENT_DIR}")
        return
    for item in CONTENT_DIR.iterdir():
        dest = DOCS_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest)
    _neutralize_missing_module_links()


def _neutralize_missing_module_links() -> None:
    """Turn links to Course-Modules pages into plain text when those pages are
    absent from the build (e.g. the public build without the external module
    source). Keeps the link label, drops the dead target — no broken links, and
    the source content/ files are left untouched.
    """
    modules_dir = DOCS_DIR / MODULES_SECTION
    # Regex for a markdown link whose target points at a Course-Modules page.
    link_re = re.compile(r"\[([^\]]+)\]\((?:\.\./)*" + re.escape(MODULES_SECTION)
                         + r"/([^)]+)\)")

    def repl(m: "re.Match[str]") -> str:
        label, target = m.group(1), m.group(2)
        # If the target module page exists in the build, keep the link as-is.
        target_path = modules_dir / target
        if target_path.exists():
            return m.group(0)
        return f"**{label}**"  # keep the name, drop the dead link

    for md in DOCS_DIR.rglob("*.md"):
        # Skip the module pages themselves.
        if MODULES_SECTION in md.parts:
            continue
        text = md.read_text(encoding="utf-8", errors="replace")
        new = link_re.sub(repl, text)
        if new != text:
            md.write_text(new, encoding="utf-8")


def sync_markdown() -> list[tuple[str, str, str]]:
    """Copy personal *.md into docs/. Returns (section, rel_dest, title)."""
    catalog: list[tuple[str, str, str]] = []
    for label, root in SOURCE_ROOTS:
        if not root.exists():
            print(f"WARNING: source root not found, skipping: {root}")
            continue
        for md in root.rglob("*.md"):
            rel = md.relative_to(root)
            if is_excluded(rel):
                continue
            if md.name in EXCLUDE_FILE_NAMES:
                print(f"EXCLUDED (confidential): {md.name}")
                continue
            dest = DOCS_DIR / label / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(md, dest)
            # Copy some pages but keep them OUT of the auto-catalog so they don't
            # get double-listed in nav/landing — they're placed explicitly
            # elsewhere (e.g. Pricing is a top-level nav item written by hand in
            # write_nav()).
            if md.name in COPY_NO_CATALOG:
                continue
            catalog.append((label, f"{label}/{rel.as_posix()}", first_heading(md)))
    return catalog


# File types we copy into the site so they can be opened from the browser.
# PDFs open inline; drawio downloads; notebooks are converted to HTML.
OPENABLE_EXTS = {".pdf", ".drawio", ".html", ".htm", ".txt", ".csv", ".png",
                 ".jpg", ".jpeg", ".gif", ".py", ".json",
                 # Office docs: browsers can't render these inline, but we copy
                 # + link them so clicking downloads the file.
                 ".docx", ".doc", ".pptx", ".ppt"}
# Big binary types we deliberately skip copying (still listed, not linked).
SKIP_COPY_EXTS = {".zip"}


def _convert_notebook(src: Path, dest_html: Path) -> bool:
    """Convert a .ipynb to standalone HTML via nbconvert. Returns success.

    Strips cell outputs and widget metadata that cause 'state' errors in
    nbconvert 7.x — this means the rendered notebook shows code + markdown but
    not the original run outputs. Better than not rendering at all.
    """
    try:
        from nbconvert import HTMLExporter
        import nbformat
        nb = nbformat.read(src, as_version=4)

        # Sanitize: clear outputs and problematic widget metadata so nbconvert
        # doesn't choke on 'state' keys.
        for cell in nb.get("cells", []):
            if cell.get("cell_type") == "code":
                cell["outputs"] = []
                cell["execution_count"] = None
            # Strip widget metadata from cell.metadata
            md = cell.get("metadata", {})
            for key in list(md.keys()):
                if key in ("widgets", "state", "jupyter"):
                    del md[key]

        # Also strip notebook-level widget state
        nb_meta = nb.get("metadata", {})
        nb_meta.pop("widgets", None)

        exporter = HTMLExporter()
        exporter.exclude_input_prompt = False
        body, _ = exporter.from_notebook_node(nb)
        dest_html.parent.mkdir(parents=True, exist_ok=True)
        dest_html.write_text(body, encoding="utf-8")
        return True
    except Exception as exc:  # noqa: BLE001 - best effort per notebook
        print(f"WARNING: notebook convert failed for {src.name}: {exc}")
        return False


def _discover_committed_modules() -> list[tuple[str, str, int, str | None]]:
    """Find module catalog pages already present in docs/Course-Modules/*.md
    (committed to the repo). Used when the external source isn't available so
    the modules still show up in nav / landing page and get published."""
    modules_dir = DOCS_DIR / MODULES_SECTION
    if not modules_dir.exists():
        return []
    files_root = modules_dir / "files"
    result: list[tuple[str, str, int, str | None]] = []
    for md in sorted(modules_dir.glob("*.md")):
        slug = md.stem
        title = first_heading(md) or slug.upper()
        # Count openable files under files/<slug>/ if present.
        slug_files = files_root / slug
        count = (sum(1 for f in slug_files.rglob("*") if f.is_file())
                 if slug_files.exists() else 0)
        result.append((title, f"{MODULES_SECTION}/{slug}.md", count,
                       topic_for_module(title)))
    return result


def build_module_pages() -> list[tuple[str, str, int, str | None]]:
    """One catalog page per extracted module, with openable file links.

    Copies openable files into docs/<MODULES_SECTION>/files/<slug>/... and
    converts notebooks to HTML so everything on the page can be opened.

    Returns (title, rel_dest, file_count, topic_slug_or_None).
    """
    if not EXTRACTED_DIR.exists():
        # No external module source (e.g. the public CI build). If module
        # catalog pages were committed to the repo previously, discover and
        # reuse them so the modules still appear in nav and get published.
        print(f"NOTE: extracted folder not found ({EXTRACTED_DIR}); "
              "using committed Course-Modules pages if present.")
        return _discover_committed_modules()

    modules_dir = DOCS_DIR / MODULES_SECTION
    files_root = modules_dir / "files"
    modules_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, str, int, str | None]] = []

    folders = sorted(
        d for d in EXTRACTED_DIR.iterdir()
        if d.is_dir() and should_catalog_module(d.name)
    )
    for folder in folders:
        title = module_title(folder.name)
        slug = module_slug(title)
        files = [p for p in folder.rglob("*") if p.is_file()]
        if not files:
            continue

        # dest folder for this module's copied/converted assets
        asset_dir = files_root / slug

        # grouped: label -> list of (rel_path, size, link_or_None, note)
        grouped: dict[str, list[tuple[str, int, str | None, str]]] = {}
        for p in files:
            ext = p.suffix.lower()
            label = EXT_LABELS.get(ext, "Other files")
            try:
                size = p.stat().st_size
            except OSError:
                size = 0
            rel = p.relative_to(folder).as_posix()
            link: str | None = None
            note = ""

            # use_directory_urls is off, so the module page is at
            # Course-Modules/<slug>.html and links resolve as files/<slug>/...
            if ext == ".ipynb":
                out = asset_dir / (Path(rel).with_suffix(".html"))
                # Incremental: only convert if the HTML isn't already there.
                if out.exists() or _convert_notebook(p, out):
                    link = f"files/{slug}/{Path(rel).with_suffix('.html').as_posix()}"
                    note = "rendered notebook"
            elif ext in OPENABLE_EXTS:
                out = asset_dir / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                try:
                    # Incremental copy: skip if dest exists with the same size.
                    if not (out.exists() and out.stat().st_size == size):
                        shutil.copy2(p, out)
                    link = f"files/{slug}/{rel}"
                    if ext == ".pdf":
                        note = "opens in browser"
                    elif ext in (".drawio", ".docx", ".doc", ".pptx", ".ppt"):
                        note = "download"
                except OSError as exc:
                    print(f"WARNING: copy failed for {p.name}: {exc}")
            # SKIP_COPY_EXTS and anything else: listed but not linked.

            grouped.setdefault(label, []).append((rel, size, link, note))

        lines = [
            f"# {title}",
            "",
            f"Source folder: `extracted/{folder.name}`",
            "",
            f"**{len(files)} files.** PDFs open in the browser, notebooks are "
            "rendered as pages, and diagrams download. Word/PowerPoint files are "
            "listed for reference (open them from the source folder).",
            "",
        ]
        for label in sorted(grouped):
            items = sorted(grouped[label], key=lambda t: t[0].lower())
            lines.append(f"## {label} ({len(items)})")
            lines.append("")
            for rel, size, link, note in items:
                name = Path(rel).name
                suffix = f" — {note}" if note else ""
                if link:
                    lines.append(f"- [{name}]({link}) — {human_size(size)}{suffix}")
                else:
                    lines.append(f"- `{name}` — {human_size(size)}{suffix}")
            lines.append("")

        (modules_dir / f"{slug}.md").write_text("\n".join(lines), encoding="utf-8")
        result.append(
            (title, f"{MODULES_SECTION}/{slug}.md", len(files), topic_for_module(title))
        )
    return result


# Map file extension -> markdown code-fence language for syntax highlighting.
_LANG = {".py": "python", ".txt": "text", ".env": "bash", ".example": "bash",
         ".sh": "bash", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml",
         ".json": "json", ".md": "markdown"}


def build_code_project_pages() -> None:
    """Render each configured code project into a page under docs/Projects/<slug>/
    with every source file embedded inline as a highlighted, copyable code block."""
    for slug, display, _icon, desc, folder, patterns in CODE_PROJECTS:
        if not folder.exists():
            print(f"WARNING: code project not found, skipping: {folder}")
            continue

        # Collect matching files, sorted by name (so 01_, 02_, ... order).
        files: list[Path] = []
        for pat in patterns:
            files.extend(folder.glob(pat))
        files = sorted(set(files), key=lambda p: p.name.lower())

        lines = [f"# {display}", "", desc, "",
                 f"Source folder: `{folder}`", ""]

        # Embed the README first if present (as-is), then the code files.
        readme = folder / "README.md"
        if readme.exists():
            lines += ["## Overview", "",
                      readme.read_text(encoding="utf-8", errors="replace").strip(),
                      ""]

        lines += ["## Source files", "",
                  "Each script below is shown inline — read it here or copy it "
                  "with the button in the top-right of the block.", ""]

        for f in files:
            if f.name.lower() == "readme.md":
                continue
            lang = _LANG.get(f.suffix.lower(), "text")
            try:
                code = f.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            lines.append(f"### {f.name}")
            lines.append("")
            lines.append(f"```{lang} title=\"{f.name}\"")
            lines.append(code.rstrip("\n"))
            lines.append("```")
            lines.append("")

        dest = DOCS_DIR / "Projects" / slug / "index.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("\n".join(lines), encoding="utf-8")


def inject_related_modules(modules: list[tuple[str, str, int, str | None]]) -> None:
    """Replace <!-- RELATED-MODULE --> in each topic page with a link to its module."""
    by_topic: dict[str, list[tuple[str, str, int]]] = {}
    for title, rel_dest, count, slug in modules:
        if slug:
            by_topic.setdefault(slug, []).append((title, rel_dest, count))

    for slug, _display, _icon, _desc in TOPICS:
        page = DOCS_DIR / "GenAI-Topics" / slug / "index.md"
        if not page.exists():
            continue
        text = page.read_text(encoding="utf-8")
        mods = by_topic.get(slug, [])
        if mods:
            block_lines = ["!!! tip \"Related course module\""]
            for title, rel_dest, count in mods:
                # link is relative to this topic page (docs/GenAI-Topics/<slug>/)
                rel = "../../" + rel_dest
                block_lines.append(f"    - [{title}]({rel}) — {count} files")
            block = "\n".join(block_lines)
        else:
            block = ""
        text = text.replace("<!-- RELATED-MODULE -->", block)
        page.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Landing page (card grid)
# ---------------------------------------------------------------------------

def _bucketize(md_catalog):
    buckets: dict[str, list[tuple[str, str]]] = {}
    for _section, rel_dest, title in md_catalog:
        buckets.setdefault(categorize(title, rel_dest), []).append((rel_dest, title))
    return buckets


def _module_sort_key(item):
    m = re.match(r"MODULE(\d+)", item[0].upper())
    return (0, int(m.group(1)), item[0].lower()) if m else (1, 0, item[0].lower())


ARROW = ":octicons-arrow-right-24:"


def _card(icon, title, link, desc="", meta="") -> str:
    """Build one Material 'card' with icon, linked title, divider, desc, CTA."""
    head = f"-   {icon}{{ .lg .middle }} __{title}__" if icon else f"-   __{title}__"
    parts = [head, "", "    ---", ""]
    if desc:
        parts += [f"    {desc}", ""]
    if meta:
        parts += [f'    <span class="card-meta">{meta}</span>', ""]
    parts.append(f"    [{ARROW} Open]({link})")
    return "\n".join(parts)


def _section(title_with_icon: str, intro: str, cards: list[str]) -> list[str]:
    out = [f"## {title_with_icon}", ""]
    if intro:
        out += [f"{intro}", ""]
    out += ['<div class="grid cards" markdown>', ""]
    out += cards
    out += ["", "</div>", ""]
    return out


def write_index(md_catalog, modules) -> None:
    buckets = _bucketize(md_catalog)
    total_docs = len(md_catalog)
    total_modules = len(modules)

    total_areas = len(TECHNOLOGIES) + len(TOPICS)
    lines = [
        "# OfferReady",
        "",
        '<p class="home-hero"><strong>Prep smarter. Land the offer.</strong> '
        "OfferReady is a hands-on prep hub for <strong>data &amp; GenAI</strong> "
        "interviews — advanced question banks with model answers, worked "
        "scenarios, an interactive practice mode, and deep-dive study notes on the "
        "whole GenAI &amp; data/cloud stack.</p>",
        "",
        '<p class="home-cta" markdown>'
        '[:material-briefcase-check: Interview Guide](Personal-SourceCode/Interview_Guide_Overview.md){ .md-button .md-button--primary }'
        "&nbsp;"
        "[:material-dumbbell: Practice mode](Personal-SourceCode/Interview_Practice.md){ .md-button }"
        "</p>",
        "",
        '<p class="home-stats">'
        f"<span>📚 <strong>{total_docs}</strong> documents</span>"
        f"<span>🎓 <strong>{total_modules}</strong> course modules</span>"
        f"<span>🧭 <strong>{len(TECHNOLOGIES)}</strong> tech areas</span>"
        f"<span>🤖 <strong>{len(TOPICS)}</strong> GenAI topics</span>"
        "</p>",
        "",
        "## Architecture at a glance",
        "",
        "How a modern GenAI application flows end to end — every box links to a "
        "page that explains it in depth.",
        "",
        "```mermaid",
        "flowchart LR",
        "    U([User]) --> APP[App / API - FastAPI]",
        "    APP --> CTX[Prompt + Context Engineering]",
        "    CTX --> RET{Retrieval}",
        "    RET --> VDB[(Vector DB)]",
        "    RET --> GDB[(Graph DB)]",
        "    CTX --> ORCH[Orchestration - LangChain / LangGraph]",
        "    ORCH --> TOOLS[Tools via MCP]",
        "    ORCH --> AGENT[Agent - plan / act / observe]",
        "    AGENT --> LLM[LLM - Bedrock]",
        "    LLM --> GUARD[Guardrails]",
        "    GUARD --> OUT([Grounded answer])",
        "    OBS[Observability &amp; Eval] -.monitors.-> ORCH",
        "    OPS[LLMOps] -.serves.-> LLM",
        "```",
        "",
        "## Getting Started in 5 Minutes",
        "",
        '<div class="grid cards" markdown>',
        "",
        "-   :material-numeric-1-circle:{ .lg .middle } __Pick your track__",
        "",
        "    ---",
        "",
        "    **Study** a technology or GenAI topic, **prep** for interviews with the"
        " deep-dive Q&A, or explore the **projects**.",
        "",
        "-   :material-numeric-2-circle:{ .lg .middle } __Read a topic page__",
        "",
        "    ---",
        "",
        "    Each page has an architecture diagram, concepts, and an *Interview deep"
        " dive* (talking points, scenarios, pitfalls, rapid-fire).",
        "",
        "-   :material-numeric-3-circle:{ .lg .middle } __Ask the agent__",
        "",
        "    ---",
        "",
        "    Run the local retrieval agent to ask questions answered from this KB"
        " with citations:",
        "",
        "    ```bash",
        "    cd agent",
        '    python ask.py "What is Cortex Analyst?"',
        "    python ask.py --area rag \"how do I evaluate RAG\"",
        "    ```",
        "",
        "-   :material-numeric-4-circle:{ .lg .middle } __Serve the site__",
        "",
        "    ---",
        "",
        "    Browse locally with working search and links:",
        "",
        "    ```bash",
        "    cd site",
        "    python -m http.server 8080",
        "    ```",
        "",
        "</div>",
        "",
        "## What's inside",
        "",
        "| Area | You'll find | Best for |",
        "| --- | --- | --- |",
        "| **Technologies** | Snowflake, Databricks, dbt, FastAPI, AWS | Platform depth + interview prep |",
        "| **GenAI Topics** | LLM fundamentals → RAG → agents → LLMOps | Learning the GenAI stack end to end |",
        "| **Study Guide** | Consolidated book + 11 course modules | Structured, module-by-module study |",
        "| **Projects & POCs** | Real architectures (e.g. data migration) | Applied, end-to-end examples |",
        "| **Interview Guide** | Question banks + model answers | Focused interview practice |",
        "| **Retrieval Agent** | Local, cited answers over this KB | Quiz yourself / quick lookup |",
        "",
        "## Sample questions to explore",
        "",
        "Try these in the agent (`python ask.py \"...\"`) or as study prompts:",
        "",
        "!!! tip \"Foundations\"",
        "    - \"Explain tokens, temperature, and top-p.\"",
        "    - \"When should I use RAG vs fine-tuning?\"",
        "    - \"What is context engineering and why does it matter?\"",
        "",
        "!!! tip \"Retrieval & agents\"",
        "    - \"Top-K retrieval vs reranking — what's the difference?\"",
        "    - \"Design a production agent that can take actions safely.\"",
        "    - \"How does MCP differ from function calling?\"",
        "",
        "!!! tip \"Data & cloud\"",
        "    - \"Explain Snowflake Cortex Analyst vs Cortex Search.\"",
        "    - \"Diagnose data skew in a Spark job.\"",
        "    - \"Design an Oracle → Snowflake migration with CDC.\"",
        "",
    ]

    # Technologies
    cards = [
        _card(icon, display, f"Technologies/{slug}/index.md", desc)
        for slug, display, icon, desc in TECHNOLOGIES
    ]
    lines += _section(
        ":material-chip: Technologies",
        "Notes and references for the platforms I build on.",
        cards,
    )

    # GenAI Topics
    cards = [
        _card(icon, display, f"GenAI-Topics/{slug}/index.md", desc)
        for slug, display, icon, desc in TOPICS
    ]
    lines += _section(
        ":material-robot-outline: GenAI Topics",
        "The building blocks of Generative & Agentic AI. Each links to its course module.",
        cards,
    )

    # Setup Guides
    cards = [
        _card(icon, display, f"Setup-Guides/{slug}/index.md", desc)
        for slug, display, icon, desc in SETUP_GUIDES
    ]
    lines += _section(
        ":material-rocket-launch-outline: Setup Guides",
        "Hands-on: stand up an LLM, a vector DB, your first RAG app and agent.",
        cards,
    )

    # Documentation
    cards = [
        _card(icon, display, f"Documentation/{slug}/index.md", desc)
        for slug, display, icon, desc in DOCUMENTATION
    ]
    lines += _section(
        ":material-book-open-variant: Documentation",
        "Cross-cutting guides: architecture, workflows, and decision guides.",
        cards,
    )

    # Enterprise
    cards = [
        _card(icon, display, f"Enterprise/{slug}/index.md", desc)
        for slug, display, icon, desc in ENTERPRISE
    ]
    lines += _section(
        ":material-office-building: Enterprise",
        "Security, governance, monitoring, and cloud reference architectures.",
        cards,
    )

    # Study Guide (book + modules) — only if that content is present.
    cards = []
    for rel_dest, title in sorted(buckets.get("Study Guide", []), key=lambda e: e[1].lower()):
        cards.append(_card(":material-book-open-page-variant:", title, rel_dest,
                           "The consolidated study book covering every topic."))
    for mtitle, rel_dest, count, _slug in sorted(modules, key=_module_sort_key):
        cards.append(_card(":material-folder-open:", mtitle, rel_dest,
                           "Course module materials.", meta=f"{count} files"))
    if cards:
        lines += _section(
            ":material-book-open-variant: Study Guide",
            "The complete study book plus all course modules.",
            cards,
        )

    # Remaining purpose categories
    intros = {
        "Interview Guide": "Question banks and prep notes for interviews.",
        "Projects & POCs": "End-to-end builds and architecture write-ups.",
        "Setup & Infrastructure": "Deployment and environment setup guides.",
        "More": "Everything else.",
    }
    for name, icon, _kw in CATEGORIES:
        if name == "Study Guide":
            continue
        entries = buckets.get(name, [])
        authored = PROJECTS_AUTHORED if name == "Projects & POCs" else []
        if not entries and not authored:
            continue
        cards = [
            _card(a_icon, display, f"Projects/{slug}/index.md", desc)
            for slug, display, a_icon, desc in authored
        ]
        if name == "Projects & POCs":
            cards += [
                _card(c_icon, c_disp, f"Projects/{c_slug}/index.md", c_desc)
                for c_slug, c_disp, c_icon, c_desc, _f, _p in CODE_PROJECTS
            ]
        def _card_key(e):
            base = Path(e[0]).name
            ov = NAV_LABEL_OVERRIDES.get(base)
            return (0, ov[0], "") if ov else (1, 0, e[1].lower())

        for rel_dest, title in sorted(entries, key=_card_key):
            base = Path(rel_dest).name
            ov = NAV_LABEL_OVERRIDES.get(base)
            display_title = ov[1] if ov else title
            cards.append(_card(":material-file-document-outline:",
                               display_title, rel_dest))
        lines += _section(f"{icon} {name}", intros.get(name, ""), cards)

    (DOCS_DIR / "index.md").write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Nav (rewrites mkdocs.yml between markers), with section icons
# ---------------------------------------------------------------------------

def write_nav(md_catalog, modules) -> None:
    if not MKDOCS_YML.exists():
        return
    buckets = _bucketize(md_catalog)

    nav = ["nav:", "  - Home: index.md",
           "  - Start Here: Start-Here/index.md"]

    # Technologies
    nav.append("  - Technologies:")
    nav.append("      - Overview: Technologies/index.md")
    for slug, display, _icon, _desc in TECHNOLOGIES:
        nav.append(f"      - {nav_label(display)}: Technologies/{slug}/index.md")

    # GenAI Topics
    nav.append("  - GenAI Topics:")
    nav.append("      - Overview: GenAI-Topics/index.md")
    for slug, display, _icon, _desc in TOPICS:
        nav.append(f"      - {nav_label(display)}: GenAI-Topics/{slug}/index.md")

    # AI Security — standalone top-level section (bare index → section icon).
    if (DOCS_DIR / "AI-Security" / "index.md").exists():
        nav.append("  - AI Security:")
        nav.append("      - AI-Security/index.md")

    # Case Studies — standalone top-level section (bare index → section icon).
    if (DOCS_DIR / "Case-Studies" / "index.md").exists():
        nav.append("  - Case Studies:")
        nav.append("      - Case-Studies/index.md")

    # Setup Guides
    nav.append("  - Setup Guides:")
    nav.append("      - Overview: Setup-Guides/index.md")
    for slug, display, _icon, _desc in SETUP_GUIDES:
        nav.append(f"      - {nav_label(display)}: Setup-Guides/{slug}/index.md")

    # Documentation
    nav.append("  - Documentation:")
    nav.append("      - Overview: Documentation/index.md")
    for slug, display, _icon, _desc in DOCUMENTATION:
        nav.append(f"      - {nav_label(display)}: Documentation/{slug}/index.md")

    # Enterprise
    nav.append("  - Enterprise:")
    nav.append("      - Overview: Enterprise/index.md")
    for slug, display, _icon, _desc in ENTERPRISE:
        nav.append(f"      - {nav_label(display)}: Enterprise/{slug}/index.md")

    # Study Guide — only emit the section if there is content for it (the study
    # book + course modules come from an external source that may be absent,
    # e.g. on the public CI build). An empty section header breaks the nav.
    study_entries = sorted(buckets.get("Study Guide", []), key=lambda e: e[1].lower())
    if study_entries or modules:
        nav.append("  - Study Guide:")
        # Emit the study book as the bare section index (it has icon front matter)
        # so the section shows an icon in the nav; the rest follow as children.
        study_index = "GenAI-AgenticAI-Complete-Study-Book.md"
        emitted_index = False
        for rel_dest, title in study_entries:
            if Path(rel_dest).name == study_index and not emitted_index:
                nav.append(f"      - {rel_dest}")  # bare = section index (icon)
                emitted_index = True
                continue
            nav.append(f"      - {nav_label(title)}: {rel_dest}")
        for mtitle, rel_dest, _count, _slug in sorted(modules, key=_module_sort_key):
            nav.append(f"      - {nav_label(mtitle)}: {rel_dest}")

    # Remaining categories
    for name, _icon, _kw in CATEGORIES:
        if name == "Study Guide":
            continue
        entries = buckets.get(name, [])
        authored = PROJECTS_AUTHORED if name == "Projects & POCs" else []
        if not entries and not authored:
            continue
        nav.append(f"  - {name}:")
        for slug, display, _icon2, _desc in authored:
            nav.append(f"      - {nav_label(display)}: Projects/{slug}/index.md")
        if name == "Projects & POCs":
            for c_slug, c_disp, _ci, _cd, _f, _p in CODE_PROJECTS:
                nav.append(f"      - {nav_label(c_disp)}: Projects/{c_slug}/index.md")
        def _entry_key(e):
            base = Path(e[0]).name
            ov = NAV_LABEL_OVERRIDES.get(base)
            # Overridden pages sort by their explicit order and come first;
            # everything else falls back to alphabetical by title.
            return (0, ov[0], "") if ov else (1, 0, e[1].lower())

        # Sections whose first (index) page should be the bare section index, so
        # Material renders the section icon from that page's `icon:` front matter.
        SECTION_INDEX = {"Interview Guide": "Interview_Guide_Overview.md"}
        index_base = SECTION_INDEX.get(name)
        for rel_dest, title in sorted(entries, key=_entry_key):
            base = Path(rel_dest).name
            if base == index_base:
                nav.append(f"      - {rel_dest}")  # bare = section index (icon)
                continue
            ov = NAV_LABEL_OVERRIDES.get(base)
            label = nav_label(ov[1]) if ov else nav_label(title)
            nav.append(f"      - {label}: {rel_dest}")

    # Practice Labs — hands-on "doing" content (scenarios, live-coding, hackathons).
    # Placed explicitly (its pages are kept out of the auto-catalog via
    # COPY_NO_CATALOG so they aren't double-listed).
    lab_pages = [
        ("Scenario Drills (Data & GenAI)", "Personal-SourceCode/Lab_Scenario_Drills.md"),
        ("Live-Coding Drills", "Personal-SourceCode/Lab_LiveCoding_Drills.md"),
        ("Hackathon Build Challenges", "Personal-SourceCode/Lab_Hackathon_Builds.md"),
    ]
    existing_labs = [(t, p) for (t, p) in lab_pages if (DOCS_DIR / p).exists()]
    if existing_labs:
        nav.append("  - Practice Labs:")
        # First entry as the bare section index so Material shows the section
        # icon (from the page's `icon:` front matter) in the nav.
        nav.append(f"      - {existing_labs[0][1]}")
        for title, rel in existing_labs[1:]:
            nav.append(f"      - {nav_label(title)}: {rel}")

    block = "# NAV:BEGIN\n" + "\n".join(nav) + "\n# NAV:END"
    text = MKDOCS_YML.read_text(encoding="utf-8")
    pattern = re.compile(r"# NAV:BEGIN.*?# NAV:END", re.DOTALL)
    text = pattern.sub(block, text) if pattern.search(text) else text.rstrip() + "\n\n" + block + "\n"
    MKDOCS_YML.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    clean_generated()
    copy_authored_content()
    md_catalog = sync_markdown()
    modules = build_module_pages()
    build_code_project_pages()
    inject_related_modules(modules)
    write_index(md_catalog, modules)
    write_nav(md_catalog, modules)
    print(
        f"Authored content + {len(md_catalog)} markdown files + "
        f"{len(modules)} course modules synced into {DOCS_DIR}"
    )
