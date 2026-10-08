# GenAI POC - LangChain & LangGraph Learning

*Last reviewed: October 2026*

Hands-on POC examples for learning LLM calls, LangChain, and LangGraph.

!!! warning "Pinned to 2024 library versions"
    `requirements.txt` pins LangChain 0.2 / LangGraph 0.2, so the scripts use APIs
    from that era (for example `langgraph.prebuilt.create_react_agent`). They still
    teach the concepts, but current LangChain 1.x code uses `create_agent` with
    middleware, and legacy chains/memory moved to `langchain-classic`. Install the
    pinned versions in a fresh virtual environment; don't mix them with 1.x.

## Setup

```bash
# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (macOS / Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and fill in your API keys (never commit `.env`):

```bash
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux
```

`07_tool_calling_agent.py` also reads `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`,
`SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE` and `SNOWFLAKE_DATABASE`, which are not
in `.env.example`; add them yourself. Use a read-only role, and note that Snowflake
is phasing out password-only sign-in, so you may need key-pair auth or a
programmatic access token instead of a password.

## Phase 1 - Foundations

| File | Description |
|------|-------------|
| `01_basic_llm_call.py` | Direct LLM calls with OpenAI and Azure OpenAI |
| `02_langchain_chat.py` | Chat assistant with conversation memory |
| `03_langchain_rag.py` | RAG (Retrieval Augmented Generation) basics |
| `04_langgraph_agent.py` | Stateful agent with tools using LangGraph |

## Phase 2 - Advanced Patterns

| File | Description |
|------|-------------|
| `05_streamlit_chat_ui.py` | Web-based chat UI with streaming |
| `06_multi_agent_system.py` | Supervisor + workers, debate/critique patterns |
| `07_tool_calling_agent.py` | Agent that queries Snowflake and calls APIs |
| `08_document_qa.py` | Upload docs and ask questions (RAG app) |

## Running

```bash
# Phase 1
python 01_basic_llm_call.py
python 02_langchain_chat.py
python 03_langchain_rag.py
python 04_langgraph_agent.py

# Phase 2
streamlit run 05_streamlit_chat_ui.py
python 06_multi_agent_system.py
python 07_tool_calling_agent.py
python 08_document_qa.py
```
