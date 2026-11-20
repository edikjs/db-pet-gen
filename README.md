# db-pet-gen

Generate a small, documented database pet project from **one topic**. The result
contains a PostgreSQL-compatible SQL schema, seed data, an illustrative
TypeScript code skeleton, an ER diagram, and a comprehensive English
`README.md`.

## Setup

Node.js 24.21.0 (see `.nvmrc`) is recommended. A configured chat model is
needed to generate projects; tests use a fake model and require no network.

```sh
nvm use
npm install
cp .env.example .env
# Edit LLM_PROVIDER and LLM_MODEL in .env for your provider/model.
npm run build
npm start -- generate --topic "Pet adoption"
```

The command prints the run id and the location of
`artifacts/runs/<run-id>/README.md`. Generated projects are kept in separate
run directories; no database server is started.

## Model selection

Set `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_API_KEY` in `.env`. For example:

```dotenv
LLM_PROVIDER=openrouter
LLM_MODEL=openai/gpt-4o-mini
LLM_API_KEY=your-key
```

Supported providers are `openrouter`, `opencode`, and `groq`.
`LLM_BASE_URL` selects an alternative endpoint; all providers require
`LLM_API_KEY`. Optional `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`,
`LLM_MAX_RETRIES`, and `LLM_MAX_CONCURRENCY` control the client. Refused calls
back off exponentially, and a refused rate limit is reported instead of
spending corrective retries on a conversation the model never saw. No key is
stored in a run manifest, event log, or diagnostic. A resume requires the same
provider/model/endpoint/temperature in `.env` as the original run. Edit `.env`
and start a new run to switch models.

## Outputs

```text
artifacts/runs/<run-id>/
  README.md                   The documented project (main deliverable)
  assets/
    ddl/schema.sql             PostgreSQL-compatible DDL
    seed/seed.sql              Sample data
    diagrams/er.mmd            Mermaid ER source (also embedded in README)
    code/database.ts           Illustrative SQLite driver and database port
    code/schema.ts             Generated table/row types
    code/repositories.ts       Data-access skeleton
    code/services.ts           Operations from the checked plan
    code/queries.sql           Key queries
  run.json                     Status, model identity, current stage
  events.jsonl                 Timestamped stage event log
  checkpoints.db              LangGraph SQLite checkpoints for resume
  qa-report.json              Validation and SQL smoke-check results
```

The generated `README.md` explains what was built, assumptions and features,
schema and relationship details, setup with `psql`, seed data, operations, and
the code skeleton. Mermaid is embedded inline; a textual relationship
description is included for viewers without Mermaid support. The **code
skeleton is illustrative**: its SQLite driver is not a ready-to-run
PostgreSQL application. SQL generation targets portable PostgreSQL syntax and
is smoke-tested against in-memory SQLite where supported; no PostgreSQL
instance is started or claimed as tested.

## Failures and resume

Each model stage proposes structured data; Zod and deterministic checks reject
inconsistent schema, foreign keys, seed rows, or code operations. A rejected
answer receives corrective feedback. Final output is assembled in code;
Mermaid is rendered in-process, Markdown links and required sections are
checked, and files are written only after the SQL smoke check passes. When a
stage fails, the run id, stage, error and resume command are printed; `run.json`
and `events.jsonl` preserve the details:

```sh
npm start -- resume <run-id>
```

Completed stages are restored from `checkpoints.db`, not asked of the model
again. `resume` refuses completed runs and runs owned by a live process.

## Source layout

```text
src/
  cli/                      Commander commands and terminal progress
  config/                   Environment and model settings
  llm/                      Provider client, rate limits and validated JSON requests
  project/
    plan/                   Topic-specific project plan
    database/               Data, seed and operation contracts and checks
  workflows/generate/
    lifecycle/              Run manifest, event log and checkpoints
    graph.ts                Generation stages
    run.ts                  First run and resume
  io/
    workspace.ts            Per-run paths
    renderers/
      sql/                  Database scripts
      code/                 TypeScript code skeleton
      markdown/             Main README and ER diagram
  adapters/observability/   Optional Phoenix tracing
  utils/                    Shared type guards
  test-support/             Offline fixtures
```

Each module has an `index.ts` barrel and colocated tests.

## Observability and development

Progress appears on stderr (spinner on a terminal; plain stage lines in
redirected logs). `events.jsonl` is the persistent stage event log. Phoenix tracing
is optional:

```sh
npm run phoenix:up
# Set OBSERVABILITY_PROVIDER=phoenix in .env
npm start -- generate --topic "Library lending"
npm run phoenix:down
```

Phoenix uses <http://localhost:6006>; the Docker service is optional.

```sh
npm run build
npm run typecheck
npm run lint:check
npm run format:check
npm test
```

`npm install` wires the hooks in `.githooks/` via `npm run prepare`. Run that
command manually if the hooks do not fire. The pre-commit hook checks lint and
formatting; the pre-push hook also runs the tests.

Tests use injected fake model responses and an in-memory SQL smoke check.
