# DevFlow — Python Backend

FastAPI + PostgreSQL(pgvector) + Redis + MinIO. Modular monolith.

## Layout

```
src/devflow/
  core/                cross-cutting: db, redis, storage, security, audit, events, ...
  modules/
    iam/               auth + users + RBAC + audit
    requirement/       requirements + projects + sub_tasks + stage gates + events
    document/          documents + versions + chunks(vector) + ACL + RAG search
      parsers/         plug-in: text, markdown, pdf, docx
      chunkers/        plug-in: fixed_size, heading_aware
      retrievers/      vector, fulltext, hybrid (RRF)
    agent/             sessions + messages + Claude/OpenAI + embeddings + RAG
      providers/       plug-in: claude, openai
    delivery/          release_runs + jenkins + log targets
    quality/           test_plans/cases/runs + gate_checks + defects
    notification/      notifications + subscriptions
  workers/             arq async tasks (embedding, notification)
  cli/                 typer admin commands (seed-admin, migrate-sqlite)
```

## Bootstrap

```bash
# 1. infrastructure
docker compose up -d           # postgres + redis + minio

# 2. install
pip install -e .[dev]

# 3. env
cp .env.example .env
# fill ANTHROPIC_API_KEY / OPENAI_API_KEY if you want agent + embeddings

# 4. schema (3 migrations: extensions+schemas → tables → indexes)
alembic upgrade head

# 5. seed admin (local-admin / local-admin)
devflow seed-admin

# 6. run API (port 4000)
uvicorn devflow.main:app --reload

# 7. run worker (separate shell)
arq devflow.workers.main.WorkerSettings
```

## Migrate from legacy SQLite

If you still have the old `server/data/devflow.db` from the Hono backend:

```bash
devflow migrate-sqlite ../server/data/devflow.db \
    --attachments-dir ../server/data/attachments
```

The script preserves IDs and is idempotent. Document bodies are uploaded to MinIO;
re-indexing (chunk + embed) runs lazily via the worker the next time a document is touched.

## Module isolation rule

Cross-module communication must go through:
- the target module's `service.py` public functions, OR
- the in-process event bus (`devflow.core.events`)

Never import another module's `models.py` or `repository.py` directly.

## Extending document handling

- New format: add a `Parser` under `modules/document/parsers/` and register it in `parsers/__init__.py`
- New chunking strategy: add a `Chunker` under `modules/document/chunkers/`
- New retriever (e.g. graph, reranker): add under `modules/document/retrievers/`
- New embedding model: implement `Embedder` protocol and pass to `set_embedder()`
