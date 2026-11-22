# db-pet-gen

Standalone TypeScript/Node.js 24 project. Its only generation input is a topic.
The CLI produces a documented Markdown project, portable PostgreSQL SQL
scripts, and an ER diagram inside `artifacts/runs/<run-id>/`.

## Commands

- `npm run build` — compile `src/` into `dist/` (run before `npm start`).
- `npm run typecheck` — check production code and colocated test typings.
- `npm start -- generate "..."` — provider and model come from `.env`.
- `npm start -- resume <run-id>` — retry an interrupted/failed run with the
  original model settings in `.env`.
- `npm run lint:check && npm run format:check && npm test` — verification.
- `npm run phoenix:up` / `npm run phoenix:down` — optional tracing container.

## Modules

Ports and adapters: `src/workflows/` is the core (domain, application and
ports), `src/cli/` is the driving adapter, `src/adapters/` holds driven
adapters, and `src/index.ts` is the only composition root. Dependencies point
inward: the core never imports `cli`, `adapters` or `config`. Cross-cutting
helpers with no domain meaning live in the neutral `src/shared/` module, which
every layer may import; keep domain rules in the core instead.

- `src/shared/` — generic diagnostics (`redact`, `errorMessage`,
  `reportDiagnostic`) usable by config, CLI, adapters and the core.
- `src/workflows/ports/` — inbound use case and outbound port interfaces.
- `src/workflows/generate/domain/` — checked data schemas, run manifest,
  artifact paths and integrity rules.
- `src/workflows/generate/rules/` — SQL and Markdown validation:
  `node-sql-parser` for model-written DDL and operations, `remark` for
  Markdown.
- `src/workflows/generate/render/` — seed SQL, operations SQL and ER source
  rendered from checked data; the diagram is parsed with Mermaid.
- `src/workflows/generate/stages/` — one slice per stage: prompt, deterministic
  verifier and rendering or publication.
- `src/workflows/generate/pipeline/` — LangGraph wiring and state schema.
- `src/workflows/generate/useCase.ts`, `journal.ts` — first run and resume over
  the ports; run-state transitions stay pure in the domain.
- `src/adapters/llm/` — OpenAI-compatible chat transport, structured JSON
  retries and rate limits; implements `ModelPort`.
- `src/adapters/run-store/` — per-run workspace, manifest, JSONL events,
  SQLite checkpoints and lock; implements `RunStorePort` and `CheckpointPort`.
- `src/adapters/artifacts/` — writes checked files into the run workspace.
- `src/adapters/observability/` — stage tracing; implements `TracePort`. Keep backend SDK code in `providers/<name>/` (e.g. `providers/phoenix/`); never attach prompts, completions or provider diagnostics.
- `src/adapters/testing/` — network-free fake model and valid fixture.
- `src/cli/` — Commander driving adapter; calls the `GenerateWorkflow` port.
- `src/config/` — validated model/run/tracing config from `.env`.
- `src/index.ts` — builds the adapters and injects them into the use case and CLI.

A separate model stage reviews all generated artifacts against the checked
data.

Before implementing a common concern (parsing, validation, collections,
redaction, and similar), check npm first. Prefer a popular, well-maintained
library over a hand-written implementation; hand-roll only when no suitable
library exists or the dependency would be disproportionate. Avoid libraries
whose last release is more than two years old unless they are still widely
used today.

Keep fixes proportional to the supported use cases. Enforce the stated contract
with the simplest readable code; add a check only for a concrete failure it
prevents. Prefer a focused regression test over a catalogue of hypothetical cases.

Use concrete domain or library types when the input shape is known. Reserve
`unknown` for unchecked boundaries such as parsed external JSON and thrown
values; narrow it there rather than passing it through typed code. Do not
replace it with `any` or a double assertion.

Model responses provide **structured data**, DDL, operation statements and Markdown.
Render the ER source from checked tables, seed SQL from checked rows and operations SQL from checked statements; keep all three
for review, checkpoint recovery and publication. Operation statements and DDL
are parsed with `node-sql-parser`; publish the checked operations in order to
`assets/operations/operations.sql` for the README's “Operations and queries” section. Markdown structure, raw HTML and
links are checked with `remark`; ER source is parsed with the official Mermaid
parser. A separate model review compares all generated artifacts with the
checked design and seed rows. Nothing is executed — do not claim operations were
run against PostgreSQL.

- In addition to syntax, structure and allowed links, compare DDL tables/columns
  and declared types (`varchar(length)` is the only modifier) and the README's
  ER copy against the checked data.
  The judge handles the remaining semantic review. A seed or diagram render or diagram parse
  failure is a generator error and must not consume a corrective model turn.
- Validate design keys and references before accepting a design. Seed each
  design table once in order with 2–5 rows, matching columns, keys, parents and
  declared value constraints (VARCHAR length, integer ranges, ISO dates).
- Each operation is one parsed statement. Compare physical table references
  with the declared design tables after resolving query-local CTEs.
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

## Commits

Use Conventional Commits for every commit:
`<type>(<optional scope>): <lowercase imperative summary>`. Types in use here
are `feat`, `fix`, `refactor`, `chore`, `docs`, and `test`; use `chore(deps):`
for dependency changes. Keep the summary short, and add a body explaining why
when the change is not obvious. Never use a bare sentence as the subject.

`.githooks/` is wired by `npm run prepare` (automatic on `npm install`).
Pre-commit runs lint and formatting checks; pre-push also runs tests.
