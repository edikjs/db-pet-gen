import type { Design, Examples } from '../domain';
import { ASSET_PATHS, OPERATIONS_PATH, columnValues } from '../domain';
import { README_FALLBACK, README_SECTIONS } from '../rules';
import { stageMessages } from './messages';

export function designPrompt(topic: string) {
  return stageMessages(
    `STAGE:design
Propose a small database pet-project from the supplied topic.
Return one English JSON object: title (string), summary (one factual paragraph),
assumptions (1-6 short strings), features (2-8 short strings), tables (2-8 objects), ddl.
Describe only this project; no citations or claims of a running application.

Each table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[].
Each column: name, type (${Object.keys(columnValues).join('|')}), primaryKey:boolean,
nullable:boolean, unique:boolean, length:number|null,
defaultValue: JSON scalar or null (not SQL text),
references:{"table":string,"column":string}|null, comment (English).
Each index: name, columns:[...], unique:boolean, comment.

Every table has a non-null primary key. Parents precede children; references target
an earlier table's primary/unique column of the same type. Include at least one foreign key.

ddl: PostgreSQL DDL, one create table per design table.
Use exact lowercase types with no precision, scale or other modifiers;
render VARCHAR as varchar(length) from the declared length (plain varchar when null).
Add "not null" when nullable is false or primary key, "unique" when unique and not primary key,
and "default <literal>" when defaultValue is set.
Add "constraint pk_<table> primary key (<columns>)" per table and
"constraint fk_<table>_<column> foreign key (<column>) references <parent> (<parent column>)"
per foreign key. Write indexes as "create [unique] index <name> on <table> (<columns>)".
Use unquoted identifiers, lowercase keywords, no comments, no IF NOT EXISTS, no DROP or ALTER.`,
    { topic },
  );
}

export function examplesPrompt(topic: string, design: Design) {
  return stageMessages(
    `STAGE:examples
Create realistic sample data and useful data operations for the supplied topic and design.
Return one English JSON object: tables (every design table in order, 2-5 rows each,
valid keys and cross-table references), operations (2-12 useful operations), readme.

Each seed table: {"table":"<table name>","rows":[{"column":value}]}.
Include every design column in every row, even nullable or defaulted columns.
Respect nullability, keys, references and every declared value constraint.
INTEGER/SMALLINT/BIGINT/REAL/NUMERIC: JSON numbers in range (BIGINT safe integers);
BOOLEAN: booleans; TEXT/VARCHAR: strings, with VARCHAR no longer than its declared length;
DATE values are YYYY-MM-DD strings and TIMESTAMP values are ISO 8601 UTC strings ending in Z.
No SQL syntax in values.

Each operation: {"name":"snake_case","title":"English description","tables":["table"],
"parameters":["name"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}.
Named parameters :name need not be columns; each must appear in the SQL,
with no undeclared parameters. No semicolons, comments or DDL.
Mention every listed table and no others.

readme: complete project README with a top-level title and these level-two sections:
${README_SECTIONS.join(', ')}.
In "Operations and queries", link to [Operation SQL](${OPERATIONS_PATH})
and describe the operations and parameters. Embed the exact checked Mermaid source
in one mermaid fence and include the "### ${README_FALLBACK}" subsection.
Link only to ${ASSET_PATHS.join(', ')}; no raw HTML, external links or images.`,
    { topic, design },
  );
}

export function judgePrompt(topic: string, design: Design, examples: Examples) {
  return stageMessages(
    `STAGE:judge
Review the supplied artifacts against the design and examples.
Return one English JSON object: matches (boolean), problems (array of short strings).

For column types, deterministic validation is authoritative:
the base type must match the design in lowercase, VARCHAR must be varchar(length),
and no other type may carry precision, scale or modifiers; report any mismatch.

Seed value constraints are also checked deterministically:
VARCHAR length, integer ranges and ISO DATE/TIMESTAMP format.

Set matches true only if ddl matches the design tables, columns, types, nullability,
defaults, keys, foreign keys and indexes; seedSql matches the checked rows;
operationsSql contains the checked operations in order, with statements plausible
for their tables and parameters; and readme accurately documents the checked
design, rows, operations and embedded ER source. Otherwise list concrete problems.`,
    { topic, design, examples },
  );
}
