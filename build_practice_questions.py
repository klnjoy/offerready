"""
Build docs/assets/interview_questions.json for the interactive Practice mode.

Parses the interview Q&A markdown in personal-docs/ and extracts:
  - `??? question "PROMPT"` collapsibles, using the following indented block as
    the model answer (code fences and admonition markers stripped).

Each question is tagged with a topic (from the filename) and a track, so the
Practice page can offer role-based sessions. Output is a static JSON the
browser loads — no backend needed.

Run:  python build_practice_questions.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "personal-docs"
OUT = ROOT / "docs" / "assets" / "interview_questions.json"

# filename stem -> (topic label, [tracks])
TOPICS: dict[str, tuple[str, list[str]]] = {
    "SQL_Interview_QA": ("SQL", ["data"]),
    "DataEngineering_Interview_QA": ("Data Engineering", ["data"]),
    "Snowflake_Interview_QA": ("Snowflake", ["data"]),
    "Databricks_Interview_QA": ("Databricks", ["data"]),
    "dbt_Interview_QA": ("dbt", ["data"]),
    "Python_Interview_QA": ("Python", ["data", "ai", "fde"]),
    "AWS_Interview_QA": ("AWS", ["data", "ai"]),
    "DevOps_Interview_QA": ("DevOps", ["data", "platform"]),
    "AI_Engineer_Interview_QA": ("AI Engineer", ["ai"]),
    "Agents_Interview_QA": ("Agents", ["ai"]),
    "LangChain_LangGraph_Interview_QA": ("LangChain/LangGraph", ["ai"]),
    "MCP_Interview_QA": ("MCP", ["ai"]),
    "GenAI_Interview_QA": ("GenAI", ["ai"]),
    "Behavioral_STAR_Interview_QA": ("Behavioral", ["data", "ai", "fde", "lead"]),
    "FastAPI_Interview_QA": ("FastAPI", ["ai", "fde", "platform"]),
    "System_Design_Interview_QA": ("System Design", ["data", "ai", "fde", "platform", "architect"]),
    "RAG_LLMOps_Interview_QA": ("RAG & LLMOps", ["ai", "platform"]),
    "AI_Security_Interview_QA": ("AI Security", ["ai", "platform", "architect"]),
    "ML_AI_Platform_Interview_QA": ("ML / AI Platform", ["platform", "ai"]),
    "FDE_Customer_Interview_QA": ("FDE / Customer", ["fde"]),
    "Leadership_Delivery_Interview_QA": ("Leadership & Delivery", ["lead", "architect"]),
    "Architecture_Interview_QA": ("Architecture", ["architect", "lead"]),
}

Q_RE = re.compile(r'^\?\?\?\s+question\s+"(.+?)"\s*$')


def clean(text: str) -> str:
    # collapse whitespace, drop leftover markdown emphasis markers lightly
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract(md_path: Path) -> list[dict]:
    lines = md_path.read_text(encoding="utf-8", errors="replace").splitlines()
    out: list[dict] = []
    i = 0
    n = len(lines)
    while i < n:
        m = Q_RE.match(lines[i].strip())
        if not m:
            i += 1
            continue
        prompt = m.group(1)
        i += 1
        # Collect the indented answer block (lines indented under the admonition).
        body: list[str] = []
        while i < n:
            ln = lines[i]
            if ln.strip() == "":
                body.append("")
                i += 1
                continue
            # indented content belongs to the admonition (>= 4 spaces)
            if ln.startswith("    "):
                body.append(ln[4:])
                i += 1
            else:
                break
        # Build the model answer: drop code fences, keep prose + inline.
        text = "\n".join(body)
        text = re.sub(r"```[\s\S]*?```", "", text)   # remove code blocks
        text = clean(text)
        if prompt and text:
            out.append({"q": prompt, "a": text})
    if not out:
        # Fallback: pages authored as `### <question>?` followed by an `A:`
        # answer (e.g. GenAI_Interview_QA). Only capture headings that look
        # like questions and have a real answer, so we skip snippet lists.
        out = extract_heading_qa(lines)
    return out


HEAD_RE = re.compile(r"^#{2,4}\s+(.*\S)\s*$")


def extract_heading_qa(lines: list[str]) -> list[dict]:
    """Extract Q/A pairs written as a heading question + an 'A:' answer block."""
    out: list[dict] = []
    i, n = 0, len(lines)
    while i < n:
        m = HEAD_RE.match(lines[i])
        if not m:
            i += 1
            continue
        raw = m.group(1).strip()
        # Normalize a heading into a question prompt.
        prompt = re.sub(r"^(Q\d+[:.)]?|Q[:.)]|\d+[.)])\s*", "", raw).strip()
        is_question = raw.rstrip().endswith("?") or bool(re.match(r"^Q\d*[:.)]", raw))
        i += 1
        # Gather body until the next heading.
        body: list[str] = []
        while i < n and not HEAD_RE.match(lines[i]):
            body.append(lines[i])
            i += 1
        blob = "\n".join(body)
        # Prefer the text after an "A:" marker as the model answer.
        am = re.search(r"(?:^|\n)\s*(?:\*\*)?A:(?:\*\*)?\s*(.+)", blob, re.DOTALL)
        answer_src = am.group(1) if am else blob
        answer_src = re.sub(r"```[\s\S]*?```", "", answer_src)  # drop code
        answer = clean(answer_src)
        # Keep only genuine Q&A: a question-looking heading + a substantive
        # prose answer (skip pure code-snippet fundamentals).
        if is_question and prompt and len(answer.split()) >= 8:
            out.append({"q": prompt, "a": answer})
    return out


def main() -> None:
    questions: list[dict] = []
    per_topic: dict[str, int] = {}
    for stem, (topic, tracks) in TOPICS.items():
        path = SRC / f"{stem}.md"
        if not path.exists():
            print(f"skip (missing): {stem}")
            continue
        items = extract(path)
        for it in items:
            it["topic"] = topic
            it["tracks"] = tracks
            it["source"] = stem
            questions.append(it)
        per_topic[topic] = len(items)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_by": "build_practice_questions.py",
        "count": len(questions),
        "topics": sorted({q["topic"] for q in questions}),
        "questions": questions,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(questions)} questions to {OUT}")
    for t, c in sorted(per_topic.items()):
        print(f"  {t:20} {c}")


if __name__ == "__main__":
    main()
