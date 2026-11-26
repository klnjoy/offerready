"""
Build docs/assets/interview_questions.json for the interactive Practice mode.

Parses the interview Q&A markdown in personal-docs/ and extracts:
  - `??? question "PROMPT"` collapsibles, using the following indented block as
    the model answer (code fences and admonition markers stripped).

Each question is tagged with a topic (from the filename) and a track, so the
Practice page can offer role-based sessions, plus cross-topic themes (see
THEMES) for the question-bank filter chips. Output is a static JSON the
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
    "Microsoft_Fabric_Interview_QA": ("Microsoft Fabric", ["data"]),
    "dbt_Interview_QA": ("dbt", ["data"]),
    "Python_Interview_QA": ("Python", ["data", "ai", "fde"]),
    "AWS_Interview_QA": ("AWS", ["data", "ai"]),
    "DevOps_Interview_QA": ("DevOps", ["data", "platform"]),
    "AI_Engineer_Interview_QA": ("AI Engineer", ["ai"]),
    "Agents_Interview_QA": ("Agents", ["ai"]),
    "LangChain_LangGraph_Interview_QA": ("LangChain/LangGraph", ["ai"]),
    "MCP_Interview_QA": ("MCP", ["ai"]),
    "GenAI_Interview_QA": ("GenAI", ["ai"]),
    "Behavioral_STAR_Interview_QA": ("Behavioral", ["data", "ai", "fde", "lead", "em", "tpm", "agile", "pm"]),
    "FastAPI_Interview_QA": ("FastAPI", ["ai", "fde", "platform"]),
    "System_Design_Interview_QA": ("System Design", ["data", "ai", "fde", "platform", "architect"]),
    "RAG_LLMOps_Interview_QA": ("RAG & LLMOps", ["ai", "platform"]),
    "AI_Security_Interview_QA": ("AI Security", ["ai", "platform", "architect"]),
    "ML_AI_Platform_Interview_QA": ("ML / AI Platform", ["platform", "ai"]),
    "Fine_Tuning_Model_Internals_Interview_QA": ("Fine-tuning & LLM Internals", ["ai", "platform"]),
    "ML_Fundamentals_Interview_QA": ("ML Fundamentals", ["ai", "data", "platform"]),
    "FDE_Customer_Interview_QA": ("FDE / Customer", ["fde"]),
    "Leadership_Delivery_Interview_QA": ("Leadership & Delivery", ["lead", "architect", "em", "tpm"]),
    "Architecture_Interview_QA": ("Architecture", ["architect", "lead"]),
    "Engineering_Manager_Interview_QA": ("Engineering Manager", ["em", "lead"]),
    "TPM_Interview_QA": ("Program & Project Management", ["tpm"]),
    "Agile_Coach_Scrum_Master_Interview_QA": ("Agile & Scrum", ["agile"]),
    "AI_Product_Manager_Interview_QA": ("Product Management", ["pm"]),
}

# question prompt -> [theme slugs] (cross-topic groupings for the
# /question-bank filter chips: token cost, guardrails, GPU & data centers).
# Keyed by exact prompt so the mapping survives reordering; a prompt
# not listed here gets an empty themes list.
THEMES: dict[str, list[str]] = {
    "A guardrail blocks a legitimate request. What should the user see, and what happens next?": ["guardrails"],
    "Design a RAG assistant for 50,000 employees over internal documents with access control.": ["guardrails"],
    "Explain attention in plain terms. Why does a long context cost more?": ["token-cost"],
    "Finance says LLM spend tripled this quarter. How do you get it under control without hurting quality?": ["token-cost"],
    "Guardrails add latency and cost to every call. How do you keep them fast and cheap?": ["guardrails"],
    "H100, A100, T4, TPU — how do you pick the right GPU for serving an LLM?": ["gpu-data-centers"],
    "How do you apply least privilege to agents and their tools?": ["guardrails"],
    "How do you build cost control into an AI-heavy system from day one?": ["token-cost"],
    "How do you cache semantically similar prompts?": ["token-cost"],
    "How do you charge token spend back to the teams or products that caused it?": ["token-cost"],
    "How do you compare LLM providers on price? What does per-million-token pricing hide?": ["token-cost"],
    "How do you control and attribute Cortex AI spend?": ["token-cost"],
    "How do you control cost and latency in an agent?": ["token-cost"],
    "How do you define RPO and RTO and design disaster recovery to meet them?": ["gpu-data-centers"],
    "How do you design autoscaling for GPU inference services?": ["gpu-data-centers"],
    "How do you enforce access control in retrieval so users only see what they are allowed to?": ["guardrails"],
    "How do you evaluate guardrails? How do you know if they are too strict or too loose?": ["guardrails"],
    "How do you filter what goes into and comes out of an LLM?": ["guardrails"],
    "How do you forecast and budget the cost of an LLM product before it launches?": ["token-cost"],
    "How do you guardrail an LLM that takes images as well as text?": ["guardrails"],
    "How do you handle PII and data residency when using third-party model providers?": ["guardrails"],
    "How do you manage the cost of model APIs or GPUs for your team?": ["token-cost"],
    "How do you plan GPU capacity for an inference service — how many GPUs, and which kind?": ["gpu-data-centers"],
    "How do you schedule GPU workloads on Kubernetes without wasting expensive capacity?": ["gpu-data-centers"],
    "How do you serve an LLM across multiple regions, and what breaks when you do?": ["gpu-data-centers"],
    "How do you stop an agent from looping forever or burning budget?": ["token-cost"],
    "How do you think about the cost of an AI feature?": ["token-cost"],
    "How do you think about the latency versus throughput trade-off when serving models?": ["gpu-data-centers"],
    "How do you use Terraform and infrastructure as code for an ML platform?": ["gpu-data-centers"],
    "How would you implement model routing across several LLMs?": ["token-cost"],
    "How would you introduce prompt caching in your system?": ["token-cost"],
    "Implement column-level PII protection across hundreds of tables without editing each.": ["guardrails"],
    "LLM costs tripled after launch — how do you reduce them without hurting quality?": ["token-cost"],
    "Reasoning models vs standard models — when do you pay for thinking?": ["token-cost"],
    "What are the trade-offs of semantic caching?": ["token-cost"],
    "What are the unit economics of an LLM feature — and how do you know if it makes money?": ["token-cost"],
    "What does Unity Catalog give you over workspace-local access control?": ["guardrails"],
    "What guardrails do you put around a production RAG or LLM application?": ["guardrails"],
    "What guardrails go around a production LLM?": ["guardrails"],
    "What is LoRA, and why is it cheaper than full fine-tuning?": ["token-cost"],
    "What is continuous batching in LLM serving and why does it matter?": ["gpu-data-centers"],
    "What is distillation, and when would you use it to cut cost?": ["token-cost"],
    "What is quantization, and when is it the right way to cut serving cost?": ["token-cost"],
    "What is the KV cache and why does it matter when serving an LLM?": ["gpu-data-centers"],
    "What is the difference between prompt caching and semantic caching?": ["token-cost"],
    "When do you use a shadow deployment for a new model or prompt, and what do you measure before promoting it?": ["gpu-data-centers"],
    "When would you run inference on spot or preemptible GPUs, and what breaks?": ["gpu-data-centers"],
    "Where do you run inference — how do you choose regions, and what do data-center power and networking change?": ["gpu-data-centers"],
    "Why do token counts surprise people, and why do they affect cost and quality?": ["token-cost"],
    "Why is insecure handling of model output a vulnerability, and how do you prevent it?": ["guardrails"],
    "You're productionizing an agent that sometimes takes destructive actions incorrectly. Design the safeguards.": ["guardrails"],
    "Your GPU bill has doubled in a quarter. How do you bring it under control?": ["gpu-data-centers"],
    "Your LLM feature is too slow and too expensive. Levers?": ["token-cost"],
    "Your RAG system indexes a shared drive and a user retrieves salary data they should not see — how do you respond?": ["guardrails"],
    "Your model-serving endpoint is slow and the GPU sits at 20 percent utilisation — how do you improve throughput?": ["gpu-data-centers"],
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
            it["themes"] = THEMES.get(it["q"], [])
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
