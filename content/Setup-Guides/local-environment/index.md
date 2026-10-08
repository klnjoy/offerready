---
icon: material/laptop
---

# Local Environment Setup

*Last reviewed: October 2026*

This guide gets you a clean, reproducible Python project for GenAI work in about
15 minutes. You will install **uv** (a fast Python and package manager), pin a
Python version, add the libraries the later guides use, and set up secrets the
safe way. Every other setup guide assumes the project you create here.

!!! info "What you'll have at the end"
    A `genai-lab/` project with Python 3.13, a locked dependency file, a `.env`
    for API keys that git ignores, and a `check_env.py` script that proves it works.

## Prerequisites

- A terminal: Terminal (macOS), PowerShell (Windows) or any shell (Linux).
- Git installed (`git --version`).
- About 2 GB free disk space. Add 3 to 10 GB more if you plan to run local
  models with Ollama in the next guide.
- No existing Python install is required. uv downloads and manages Python for you.

## Step 1: Install uv

=== "macOS"

    ```bash
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # or, with Homebrew
    brew install uv
    ```

=== "Windows"

    ```powershell
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    # or, with WinGet
    winget install --id=astral-sh.uv -e
    ```

=== "Linux"

    ```bash
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # if curl is missing
    wget -qO- https://astral.sh/uv/install.sh | sh
    ```

Open a new terminal so your `PATH` picks it up, then check:

```bash
uv --version
```

## Step 2: Create the project and pin Python

```bash
uv python install 3.13
uv init genai-lab --python 3.13
cd genai-lab
```

`uv init` creates `pyproject.toml`, `.python-version`, a `main.py` and a git
repository. Python 3.12 works just as well. Use it if a library you need has not
yet shipped 3.13 wheels.

## Step 3: Add dependencies

```bash
uv add openai anthropic ollama python-dotenv
uv add chromadb            # used in Vector DB Setup and First RAG
```

`uv add` updates `pyproject.toml`, writes a `uv.lock` file and creates `.venv/`
on its own. Commit `uv.lock` so teammates and CI get the same versions.

You do not need to activate the virtual environment. Prefix commands with
`uv run` and they run inside it:

```bash
uv run python --version
```

## Step 4: Keep secrets out of git

Create `.env` in the project root:

```bash title=".env"
# Never commit this file.
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Then make sure git ignores it **before** your first commit:

```bash
echo ".env" >> .gitignore
git check-ignore .env      # prints ".env" if it is ignored
```

Also commit a `.env.example` with the variable names and empty values, so others
know what to set.

!!! danger "If a key ever lands in git"
    Revoke it in the provider console straight away and create a new one.
    Removing the commit is not enough, because history, forks and CI logs keep
    copies. A pre-commit secret scanner such as `gitleaks` catches most of these
    mistakes before they happen.

## Step 5: A complete working check

Replace `main.py` with `check_env.py`:

```python title="check_env.py"
import importlib
import os
import sys

from dotenv import load_dotenv

load_dotenv()  # reads .env into os.environ

print(f"Python {sys.version.split()[0]}")

for pkg in ["openai", "anthropic", "ollama", "chromadb"]:
    mod = importlib.import_module(pkg)
    print(f"  {pkg:<10} {getattr(mod, '__version__', 'installed')}")

for key in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]:
    value = os.getenv(key)
    status = f"set (ends ...{value[-4:]})" if value else "not set"
    print(f"  {key:<18} {status}")
```

```bash
uv run check_env.py
```

!!! success "Expected output"
    A Python 3.13.x line, one line per package with its version, and each key
    marked `set` or `not set`. Having no keys is fine if you plan to use Ollama
    only. The script never prints a full key.

## Suggested project layout

```text
genai-lab/
├── .env              # secrets (gitignored)
├── .env.example      # variable names only (committed)
├── pyproject.toml
├── uv.lock
├── data/             # source docs for RAG
├── llm.py            # model clients
├── vectors.py        # vector store code
├── rag.py
└── agent.py
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `uv: command not found` | Open a new terminal. Otherwise add `~/.local/bin` (macOS/Linux) to `PATH`. |
| PowerShell blocks the script | Use the `-ExecutionPolicy ByPass` command shown above, or install with WinGet. |
| SSL certificate errors behind a corporate proxy | Run `uv` with `--native-tls` so it uses the system trust store, or set `SSL_CERT_FILE` to your company CA bundle. Do not turn off TLS verification. |
| `chromadb` fails to build | Make sure you are on Python 3.12 or 3.13 (`uv run python --version`). Pick the other one with `uv python pin 3.12` and then run `uv sync`. |
| A key shows `not set` | `.env` must sit in the folder you run from, and lines must be `KEY=value` with no spaces around `=`. |

## Cost and safety notes

- Nothing in this guide costs money. API calls start in the next guide.
- Use a **separate, low-limit API key** for learning, and set a monthly spend cap
  in each provider's billing settings.
- Never paste keys into notebooks you share, screenshots or issue reports.

## What to build next

- [LLM Access](../llm-access/index.md): make your first call to OpenAI,
  Anthropic or a local Ollama model.
- Add `ruff` (`uv add --dev ruff`) and a pre-commit hook to lint code and scan
  for secrets.

## How this shows up in interviews

Environment setup rarely gets its own question, but it shows up in how you talk
about delivery:

- *"How do you make a Python service reproducible?"* Talk about lockfiles
  (`uv.lock`), pinned interpreter versions and building the container from the
  lockfile.
- *"How do you manage secrets?"* `.env` for local work only. In production you
  use a secrets manager (AWS Secrets Manager, Vault) and inject at runtime, with
  rotation and least-privilege keys for each environment.
- Practise these in [Python Q&A](../../Personal-SourceCode/Python_Interview_QA.md)
  and [DevOps Q&A](../../Personal-SourceCode/DevOps_Interview_QA.md).
