---
icon: material/vector-triangle
---

# Vector DB Setup

*Last reviewed: October 2026*

Stand up a vector store, load embeddings and run a similarity search. This is the
retrieval backend for RAG. The concepts (ANN indexes, distance metrics, hybrid
search) are covered in [Vector DB](../../GenAI-Topics/vector-db/index.md) and
[Embeddings](../../GenAI-Topics/embeddings/index.md). This page is the hands-on
setup.

```mermaid
flowchart LR
    D[Text chunks] --> EM[Embedding model] --> V[(Vector store)]
    Q[Query] --> EM2[Same embedding model] --> V --> R[Top-k chunks + metadata]
```

## Which store to pick

| Store | Runs as | Good for |
|---|---|---|
| **Chroma** | Embedded library, or a server | The fastest way to start. Fine for prototypes and small apps. |
| **Qdrant** | Embedded local mode, Docker or cloud | Payload filtering, a production server, and hybrid search. |
| **LanceDB** | Embedded, file or object storage | Columnar data on disk or S3, and larger-than-memory datasets. |
| **pgvector** | Postgres extension | When you already run Postgres and want SQL, joins and transactions. |

## Prerequisites

- The `genai-lab` project from [Local Environment](../local-environment/index.md).
- An embedding model, either one of these:
    - **Local (free):** Ollama with `ollama pull nomic-embed-text` (768 dimensions).
    - **Hosted:** an OpenAI key and `text-embedding-3-small` (1,536 dimensions).
      Check the [embeddings guide](https://platform.openai.com/docs/guides/embeddings)
      for current models.
- Docker, for the pgvector tab only.

## Step 1: A shared embedding helper

```python title="embed.py"
import os

from dotenv import load_dotenv

load_dotenv()
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "ollama")


def embed(texts: list[str]) -> list[list[float]]:
    """Return one vector per input text. Use the SAME model for docs and queries."""
    if EMBED_PROVIDER == "openai":
        from openai import OpenAI
        r = OpenAI().embeddings.create(model="text-embedding-3-small", input=texts)
        return [d.embedding for d in r.data]
    import ollama
    return ollama.embed(model="nomic-embed-text", input=texts).embeddings


DOCS = [
    ("d1", "Snowflake separates storage and compute.", "snowflake"),
    ("d2", "RAG grounds an LLM in your own data at query time.", "genai"),
    ("d3", "Delta Lake adds ACID transactions to data lakes.", "databricks"),
]
```

## Step 2: Load and query

=== "Chroma"

    ```bash
    uv add chromadb
    ```

    ```python title="vectors_chroma.py"
    import chromadb
    from embed import DOCS, embed

    client = chromadb.PersistentClient(path="./chroma_data")
    col = client.get_or_create_collection("docs")

    col.upsert(
        ids=[d[0] for d in DOCS],
        documents=[d[1] for d in DOCS],
        metadatas=[{"source": d[2]} for d in DOCS],
        embeddings=embed([d[1] for d in DOCS]),
    )

    res = col.query(query_embeddings=embed(["what is RAG?"]), n_results=2)
    for doc, dist in zip(res["documents"][0], res["distances"][0]):
        print(f"{dist:.3f}  {doc}")
    ```

    Results come back as one list per query, so you index `[0]`.

=== "Qdrant"

    ```bash
    uv add qdrant-client
    ```

    ```python title="vectors_qdrant.py"
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
    from embed import DOCS, embed

    client = QdrantClient(path="./qdrant_data")   # local mode; or url="http://localhost:6333"
    vectors = embed([d[1] for d in DOCS])

    if not client.collection_exists("docs"):
        client.create_collection(
            "docs", vectors_config=VectorParams(size=len(vectors[0]),
                                                distance=Distance.COSINE))

    client.upsert("docs", points=[
        PointStruct(id=i, vector=v, payload={"text": d[1], "source": d[2]})
        for i, (d, v) in enumerate(zip(DOCS, vectors))
    ])

    hits = client.query_points("docs", query=embed(["what is RAG?"])[0],
                               limit=2, with_payload=True).points
    for h in hits:
        print(f"{h.score:.3f}  {h.payload['text']}")
    ```

    To run the server instead, use `docker run -p 6333:6333 qdrant/qdrant`.

=== "LanceDB"

    ```bash
    uv add lancedb
    ```

    ```python title="vectors_lancedb.py"
    import lancedb
    from embed import DOCS, embed

    db = lancedb.connect("./lance_data")
    rows = [{"id": d[0], "text": d[1], "source": d[2], "vector": v}
            for d, v in zip(DOCS, embed([d[1] for d in DOCS]))]
    tbl = db.create_table("docs", data=rows, mode="overwrite")

    for r in tbl.search(embed(["what is RAG?"])[0]).limit(2).to_list():
        print(f"{r['_distance']:.3f}  {r['text']}")
    ```

=== "pgvector"

    ```bash
    docker run -d --name pgvector -e POSTGRES_PASSWORD=postgres \
      -p 5432:5432 pgvector/pgvector:pg18
    uv add "psycopg[binary]" pgvector numpy
    ```

    ```python title="vectors_pgvector.py"
    import numpy as np
    import psycopg
    from pgvector.psycopg import register_vector
    from embed import DOCS, embed

    vectors = embed([d[1] for d in DOCS])
    dim = len(vectors[0])

    with psycopg.connect("postgresql://postgres:postgres@localhost:5432/postgres",
                         autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        register_vector(conn)
        conn.execute("DROP TABLE IF EXISTS docs")
        conn.execute(f"CREATE TABLE docs (id text PRIMARY KEY, chunk text, "
                     f"source text, embedding vector({dim}))")
        conn.execute("CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops)")
        for d, v in zip(DOCS, vectors):
            conn.execute("INSERT INTO docs VALUES (%s, %s, %s, %s)",
                         (d[0], d[1], d[2], np.array(v)))

        q = np.array(embed(["what is RAG?"])[0])
        rows = conn.execute("SELECT chunk, embedding <=> %s AS dist FROM docs "
                            "ORDER BY dist LIMIT 2", (q,)).fetchall()
        for chunk, dist in rows:
            print(f"{dist:.3f}  {chunk}")
    ```

    `<=>` is cosine distance. Similarity is `1 - distance`. Add
    `WHERE source = %s` for metadata filtering.

Run the one you chose, for example `uv run vectors_chroma.py`.

!!! success "Expected output"
    Two lines, with the RAG sentence (`d2`) first. Chroma, LanceDB and pgvector
    print a **distance**, where lower means closer. Qdrant with `COSINE` prints a
    **score**, where higher means closer. The exact numbers depend on the
    embedding model.

## Key setup rules

- **Use the same embedding model for indexing and querying.** Vectors from
  different models can't be compared, so changing models means re-embedding
  everything.
- **The dimensions must match.** The column or collection size must equal the
  model's output size: 768 for `nomic-embed-text`, 1,536 for
  `text-embedding-3-small`.
- **Store metadata** such as source, tenant and date next to each vector, so you
  can filter, cite and delete.
- **Upsert by stable IDs** so that re-running ingestion doesn't create duplicates.

## Troubleshooting

| Error | Fix |
|---|---|
| `dimension mismatch` / `expected N dimensions` | You switched embedding models. Drop and recreate the collection or table. |
| Ollama `model "nomic-embed-text" not found` | Run `ollama pull nomic-embed-text`. |
| Qdrant `Storage folder ... is already accessed by another instance` | Local mode allows only one process. Close the other script, or run the Docker server. |
| pgvector `type "vector" does not exist` | `CREATE EXTENSION vector` didn't run. Use the `pgvector/pgvector` image, not plain `postgres`. |
| pgvector `can't adapt type 'list'` | Call `register_vector(conn)` and pass `numpy` arrays. |
| Results look random | Check that the query is embedded with the same model, and that you aren't reading a distance as if it were a similarity. |

## Cost and safety notes

- Hosted embeddings are cheap per call but add up when you re-embed a large
  corpus. Cache vectors and re-embed only the chunks that changed.
- Every local store here writes to a folder (`./chroma_data` and so on). Add these
  folders to `.gitignore`. They can contain your source text.
- Change the default `postgres` password for anything other than local testing.
  In multi-tenant apps, filter by tenant on the **server side** for every query.

## What to build next

- Load real documents, split them into chunks and wire up an LLM in
  [First RAG App](../first-rag/index.md).
- Add keyword search and reranking: see
  [Retrieval Tuning](../../GenAI-Topics/retrieval-tuning/index.md).

## How this shows up in interviews

- *"Which vector database would you choose?"* Answer with constraints rather
  than brands: data size, filter needs, ops capacity, whether Postgres is
  already running, and latency targets.
- *"HNSW or IVF, and what are the trade-offs?"* Recall versus memory, build time
  and update cost. See [Vector DB](../../GenAI-Topics/vector-db/index.md).
- *"How do you handle a re-embedding migration?"* Dual-write to a new index,
  backfill, compare results on an eval set, then cut over.
- Practise in [GenAI Q&A](../../Personal-SourceCode/GenAI_Interview_QA.md).
