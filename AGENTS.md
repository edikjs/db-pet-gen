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
- `src/llm/` — OpenAI-compatible chat model and structured JSON retries.
- `src/shared/schemas/` — shared types and schemas.
- `src/shared/utils/` — shared error helpers.
- `src/workflows/generate/` — LangGraph stages: plan, schema, seed, operations,
  documentation+smoke QA, publish; run entry and resume.
- `src/workflows/generate/lifecycle/` — per-run manifest, JSONL events and
  SQLite checkpoints.
- `src/io/workspace.ts` and `src/io/renderers/` — run paths and deterministic
  Kysely-compiled SQL, `ts-poet`-emitted code, and `mdast`/`remark`-backed
  Markdown/ER renderers.
- `src/cli/`, `src/index.ts` — Commander CLI, terminal progress, errors.
- `src/adapters/observability/` — optional Phoenix tracing.
- `src/test-support/` — network-free fake model and valid fixture.

Before implementing a common concern (parsing, validation, collections,
redaction, and similar), check npm first. Prefer a popular, well-maintained
library over a hand-written implementation; hand-roll only when no suitable
library exists or the dependency would be disproportionate. Avoid libraries
whose last release is more than two years old unless they are still widely
used today.

Model responses provide **structured data**. Do not let model text write
arbitrary paths, raw TypeScript, or Markdown links. Code and Markdown render
from checked data. The generated SQLite driver is an illustrative skeleton;
do not claim generated code is a runnable PostgreSQL application.

- Render Markdown and Mermaid from checked data with libraries, not by
  concatenating ad-hoc strings.
- Antipattern: pass-through wrappers. Do not create a one-line function that
  only renames a library call (for example `camelName` around `camelCase`).
  Call the library directly and keep functions only when they encode a real
  decision, format, or domain concept.
- No hand-written regular expressions in production code — use a library.
- No spaghetti: no long functions made of multiple `if`/`for` blocks and no
  chains of ternary operators. Keep decisions in data or in small named
  functions with one responsibility.
- Prefer typed structures (a Markdown AST, a layout config) and functional
  composition (`.map`, `.filter`, `.flatMap`) in small focused modules.
- `src/io/renderers/markdown/markdownRenderer.ts` is only a thin entry point.

Keep named types and interfaces in a `types.ts` file in their module folder.
Types derived from a Zod schema (`z.infer<typeof ...>`, `typeof SomeSchema.State`)
may stay beside that schema instead. Implementation files import their types
from `types.ts`. Export only symbols that are actually imported somewhere — no
unused exports in implementation files, `types.ts` files or `index.ts` barrels.

Use `index.ts` barrels for cross-folder imports; tests live beside their
implementation. Never log API keys. Keep the root `README.md` and this file aligned with
behavior. Finish changes with `npm run build && npm run typecheck &&
npm run lint:check && npm run format:check && npm test`. Tests are colocated
(`foo.test.ts`).
Prettier uses single quotes (`.prettierrc.json`); Jest transforms ESM-only
dependencies through `ts-jest`.

`.githooks/` is wired by `npm run prepare` (automatic on `npm install`).
Pre-commit runs lint and formatting checks; pre-push also runs tests.
