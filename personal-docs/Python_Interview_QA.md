---
icon: material/language-python
---

# Python Interview Q&A — Advanced & Scenario-Based

*Last reviewed: October 2026*

Senior Python questions for data/AI engineering: concurrency, memory,
performance, and the runtime behaviors that trip people up. Study at a glance,
then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.

---

## Study checklist

Can you explain each without notes?

- [ ] The GIL and when it matters (CPU vs I/O bound)
- [ ] asyncio vs threads vs processes — how to choose
- [ ] Generators vs lists for memory and streaming
- [ ] How to profile CPU and memory
- [ ] Mutable default argument trap
- [ ] `is` vs `==` and interning
- [ ] Shallow vs deep copy
- [ ] Decorators and context managers (what they buy you)
- [ ] Making ETL idempotent / retry-safe
- [ ] Pydantic at boundaries

---

## 60-second talking points

- **"The GIL means threads don't parallelize CPU work."** Threads for I/O-bound
  concurrency, processes (or native extensions) for CPU-bound.
- **"Generators stream; lists materialize."** For large data, generators keep
  memory flat and enable lazy pipelines.
- **"Validate at boundaries, keep the core pure."** Easier to test, reason about,
  and parallelize.

---

## Core concepts — simple, then the nuance

??? note "The GIL: explain it simply, then go deep"
    **Simple:** In CPython, only one thread runs Python code at a time. So threads
    don't make CPU-heavy work faster — but they're fine for waiting on I/O.

    **The nuance:** The GIL protects interpreter state. For **CPU-bound** work, use
    `multiprocessing` (separate interpreters/memory) or push into C/NumPy which
    releases the GIL. For **I/O-bound** work, the GIL is released while waiting, so
    threads and `asyncio` give real concurrency. **Free-threaded CPython** (PEP 703)
    shipped as experimental in 3.13 and became officially supported, but still
    opt-in (a separate `python3.14t` build), in 3.14. It removes the GIL at some
    single-thread cost, and C extensions must declare support. Python 3.14 also
    added `concurrent.interpreters` (subinterpreters with their own GIL). Assume
    the GIL in most production environments today, and say how you'd verify that
    your dependencies support free-threading before relying on it.

??? note "Generators vs lists: simple, then deep"
    **Simple:** A list holds everything in memory at once; a generator produces
    items one at a time as you ask for them.

    **The nuance:** Generators enable **lazy pipelines** — you can chain
    transformations over a huge or infinite stream with flat memory, single-pass and
    no random access. Lists are eager, support indexing/reuse, but cost memory
    proportional to size. For big ETL, compose generators; for repeated random
    access, materialize.

---

## Concurrency & the GIL

=== "I/O-bound: asyncio + bounded concurrency"

    ```python
    import asyncio, aiohttp

    async def fetch(session, url, sem):
        async with sem:                      # cap concurrency
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                return await r.text()

    async def main(urls):
        sem = asyncio.Semaphore(50)
        async with aiohttp.ClientSession() as s:
            return await asyncio.gather(*(fetch(s, u, sem) for u in urls))
    ```

=== "CPU-bound: processes"

    ```python
    from concurrent.futures import ProcessPoolExecutor
    def heavy(n): return sum(i*i for i in range(n))
    with ProcessPoolExecutor() as ex:
        results = list(ex.map(heavy, [10_000_000]*8))
    ```

=== "I/O-bound: threads (blocking libs)"

    ```python
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=40) as ex:
        results = list(ex.map(call_api, payloads))
    ```

!!! example "Worked scenario: 10k API calls, some flaky"
    **Task:** Call an API 10,000 times; some calls fail or hang.

    **Reasoning:**
    1. **I/O-bound → concurrency, not parallelism.** Use `asyncio` + `aiohttp`.
    2. **Bound concurrency** with a semaphore (e.g. 50) so you don't exhaust sockets
       or trip rate limits.
    3. **Per-request timeout** so one hang doesn't stall the batch.
    4. **Retry with backoff** on transient failures; collect errors separately.
    5. If the client lib is **blocking**, use a `ThreadPoolExecutor` with a capped
       worker count instead.

    **Outcome:** "Concurrency capped + timeouts + retries — that's the difference
    between a demo and something that survives production."

??? question "Explain the GIL and when it actually matters."
    The Global Interpreter Lock lets only one thread execute Python bytecode at a
    time in CPython. It matters for **CPU-bound** work — threads won't speed it up;
    use `multiprocessing` or C/NumPy (which releases the GIL). For **I/O-bound**
    work the GIL is released while waiting, so threads and `asyncio` shine.

??? question "asyncio vs threads vs processes — how do you choose?"
    **asyncio**: thousands of concurrent I/O waits, one thread, cooperative — best
    with async libraries. **Threads**: I/O-bound with blocking libraries, simpler
    model, GIL-limited for CPU. **Processes**: CPU-bound parallelism, separate
    memory, higher overhead + IPC. Rule of thumb: I/O → async/threads; CPU →
    processes or native code.

??? question "You have 10k API calls to make. Design it."
    I/O-bound → concurrency. `asyncio` + `aiohttp` with a **semaphore** to bound
    concurrency, per-request timeouts, and retries with backoff; gather in chunks. If
    the client lib is blocking, a capped `ThreadPoolExecutor` is the pragmatic
    alternative.

??? question "How do you run many async tasks so one failure doesn't leave orphans?"
    Use **structured concurrency**: `asyncio.TaskGroup` (3.11+). All tasks run
    inside an `async with` block; if one raises, the rest are cancelled and the
    errors surface together as an `ExceptionGroup` (handle with `except*`). That
    beats bare `asyncio.gather`, which by default leaves the other tasks running
    after the first error. Wrap each call with `asyncio.timeout()` and a semaphore
    for bounded concurrency. If you need partial results, catch errors inside each
    task and return them as values instead.

??? question "What's the difference between concurrency and parallelism?"
    **Concurrency** = dealing with many things at once by interleaving (one core can
    be concurrent via async). **Parallelism** = doing many things at literally the
    same time (multiple cores). Python threads give concurrency but not CPU
    parallelism (GIL); processes give parallelism.

---

## Memory & performance

??? question "A script loads a 20 GB file and OOMs. Fix it."
    Don't materialize it. **Stream** line-by-line or in chunks: iterate the file
    object, `pandas.read_csv(..., chunksize=...)`, or a generator pipeline. For
    columnar data use PyArrow/Parquet and process row groups. Keep the working set
    bounded; aggregate incrementally.

??? question "How do you find what's slow or memory-heavy?"
    Time: `cProfile` + `snakeviz`, or `line_profiler` for hot lines. Memory:
    `tracemalloc` or `memory_profiler`. Profile, find the top offender, optimize,
    remeasure. Often the win is algorithmic (O(n²)→O(n)) or avoiding repeated work,
    not micro-optimizations.

??? question "List vs generator vs NumPy array for a big numeric pipeline?"
    **List**: flexible but memory-heavy and slow for math. **Generator**: lazy, flat
    memory, single-pass. **NumPy array**: contiguous, vectorized C loops, releases
    the GIL — fastest for numeric work. Big numeric transforms → vectorize with
    NumPy; streaming ETL → generators.

=== "Vectorize instead of looping"

    ```python
    import numpy as np
    a = np.arange(1_000_000)
    # slow: [x*2 for x in a]  -> fast, vectorized in C:
    b = a * 2
    ```

??? question "Why can `pandas` blow up memory and how do you control it?"
    Object dtypes (strings), copies from chained operations, and loading everything
    at once. Control it: use categorical dtypes, downcast numerics, read in
    `chunksize`, select only needed columns, and prefer Parquet over CSV. For very
    large data, move to PyArrow/Polars or push aggregation to the warehouse.

---

## Language internals & gotchas

??? question "Why is a mutable default argument dangerous?"
    Default values are evaluated **once** at definition, so a mutable default is
    shared across calls and accumulates state. Use `None` as the sentinel and create
    the object inside.

    ```python
    def f(x, acc=None):
        acc = [] if acc is None else acc
        acc.append(x); return acc
    ```

??? question "`is` vs `==`, and the small-int/interning trap."
    `==` compares value; `is` compares identity. CPython caches small ints (−5..256)
    and interns some strings, so `is` may accidentally "work" then fail for larger
    values. Use `==` for value comparison; reserve `is` for `None`/singletons.

??? question "Deep vs shallow copy — when does it bite?"
    A shallow copy duplicates the container but shares nested objects, so mutating a
    nested list mutates both. Use `copy.deepcopy` when you need full independence
    (nested config). Mind the performance cost on large structures.

??? question "What do decorators and context managers give you?"
    **Decorators** wrap a callable to add cross-cutting behavior (timing, retry,
    `lru_cache`, auth) without touching the body. **Context managers** (`with`)
    guarantee setup/teardown even on exceptions — files, locks, DB connections,
    transactions. Both are about clean resource/behavior management.

??? question "Explain `__slots__` and when you'd use it."
    `__slots__` declares a fixed set of attributes, skipping the per-instance
    `__dict__`. It cuts memory for **many small objects** (millions of records) and
    slightly speeds attribute access, at the cost of dynamic attributes. Use it in
    hot, high-count data classes; skip it for general flexibility.

---

## Data engineering flavored

??? question "How do you make an ETL step idempotent and retry-safe?"
    Re-running yields the same result: **upserts/MERGE** keyed on a natural/hash key
    (not blind inserts); atomic writes (temp location then swap); checkpoint
    progress; idempotency keys for external side effects. Then retries with backoff
    are safe.

??? question "Pydantic — why use it at boundaries?"
    It validates and coerces external input (API payloads, config, LLM JSON) into
    typed models, failing fast with clear errors. At boundaries you can't trust
    input; Pydantic turns "hope it's the right shape" into enforced, documented
    contracts. In LLM apps the same model doubles as the **JSON Schema** you pass to
    a provider's structured-output or tool-calling API (`Model.model_json_schema()`),
    then validates the response (`Model.model_validate_json`). Pydantic v2 has a Rust
    core, so validation is cheap enough for hot paths.

??? question "How do you set up and ship a Python project in 2026?"
    `pyproject.toml` as the single source of truth; **uv** for fast environment,
    dependency and Python-version management with a committed lockfile (`uv.lock`)
    for reproducible builds; **Ruff** for lint and format; a type checker (mypy or
    pyright) in CI; pytest. Pin direct dependencies with ranges in
    `pyproject.toml`, rely on the lockfile for exact versions, and scan
    dependencies for vulnerabilities. Containers install from the lockfile so dev,
    CI and prod match.

??? question "How do you handle a poison message / bad record in a batch?"
    Isolate it — route failures to a dead-letter store with the error and continue
    processing the rest (don't let one record kill the batch). Make the step
    idempotent so reprocessing after a fix is safe, and log enough context to
    diagnose. Fail the whole batch only when the error rate crosses a threshold.

---

## Rapid-fire

| Q | A |
|---|---|
| `append` vs `extend`? | append adds one element; extend adds each item of an iterable |
| `sort` vs `sorted`? | sort in-place returns None (lists); sorted returns new (any iterable) |
| Tuple vs list? | tuple immutable/hashable/lighter; list mutable |
| `__str__` vs `__repr__`? | str = human-readable; repr = unambiguous/debug |
| Shallow vs deep copy? | shallow shares nested refs; deep fully duplicates |
| `@staticmethod` vs `@classmethod`? | static = no implicit arg; class = receives `cls` |
| Generator expr vs list comp? | `()` lazy/streaming; `[]` eager/materialized |
| `lru_cache`? | memoizes results by args |
| `__slots__`? | fixed attrs, no per-instance dict → less memory |
| GIL affects? | CPU-bound threads (not I/O-bound) |
| Free-threaded Python? | supported opt-in build since 3.14 (`python3.14t`) |
| `TaskGroup`? | structured concurrency: one failure cancels siblings |

---

## Pitfalls interviewers probe

- Expecting threads to speed up CPU-bound work (GIL).
- Mutable default arguments accumulating state.
- Using `is` for value comparison.
- Loading huge files fully into memory instead of streaming.
- Bare `except:` swallowing errors.
- Micro-optimizing before profiling.

---

## Self-quiz

1. Design 10k flaky API calls to run efficiently and safely.
2. When do threads help and when are they pointless?
3. A 20 GB file OOMs your script — what's your fix?
4. Explain the mutable-default-argument bug and the fix.
5. `is` vs `==` — give an example where `is` misleads.
6. How do you make an ETL step idempotent?
7. When would `__slots__` actually matter?
8. Why can pandas blow up memory, and how do you control it?

!!! note "Cross-links"
    Related: [AI Engineer Interview Q&A](AI_Engineer_Interview_QA.md) ·
    [Snowflake Interview Q&A](Snowflake_Interview_QA.md)
