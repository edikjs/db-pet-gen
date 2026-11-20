# db-pet-gen

Standalone TypeScript/Node.js 24 project. Its only generation input is a topic.
The CLI produces a documented Markdown project, portable PostgreSQL SQL
scripts, a TypeScript code skeleton, and an ER diagram inside
`artifacts/runs/<run-id>/`.

## Commands

- `npm run build` — compile `src/` into `dist/` (run before `npm start`).
- `npm run typecheck` — check production code and colocated test typings.
- `npm start -- generate --topic "..."` — provider and model come from `.env`.
- `npm start -- resume <run-id>` — retry an interrupted/failed run with the
  original model settings in `.env`.
- `npm run lint:check && npm run format:check && npm test` — verification.
- `npm run phoenix:up` / `npm run phoenix:down` — optional tracing container.

## Modules

- `src/config/` — validated model/run/tracing config from `.env`.
- `src/llm/` — provider-agnostic chat model and structured JSON retries.
- `src/project/plan/` — the topic-specific project plan contract.
- `src/project/database/` — database/code contracts and deterministic checks.
- `src/workflows/generate/` — LangGraph stages: plan, schema, seed, operations,
  documentation+smoke QA, publish; run entry and resume.
- `src/workflows/generate/lifecycle/` — per-run manifest, JSONL events and
  SQLite checkpoints.
- `src/io/workspace.ts` and `src/io/renderers/` — run paths and deterministic
  SQL, code and Markdown/ER renderers.
- `src/cli/`, `src/index.ts` — Commander CLI, terminal progress, errors.
- `src/adapters/observability/` — optional Phoenix tracing.
- `src/test-support/` — network-free fake model and valid fixture.

Model responses provide **structured data**. Do not let model text write
arbitrary paths, raw TypeScript, or Markdown links. Code and Markdown render
from checked data. The generated SQLite driver is an illustrative skeleton;
do not claim generated code is a runnable PostgreSQL application.

Use `index.ts` barrels for cross-folder imports; tests live beside their
implementation. Never log API keys. Keep the root `README.md` and this file aligned with
behavior. Finish changes with `npm run build && npm run typecheck &&
npm run lint:check && npm run format:check && npm test`. Tests are colocated
(`foo.test.ts`).
Prettier uses single quotes (`.prettierrc.json`); Jest transforms ESM-only
dependencies through `ts-jest`.

`.githooks/` is wired by `npm run prepare` (automatic on `npm install`).
Pre-commit runs lint and formatting checks; pre-push also runs tests.
