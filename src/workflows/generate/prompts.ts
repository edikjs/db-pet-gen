import {
  README_FALLBACK,
  README_SECTIONS,
  type Design,
  type Examples,
} from '../../shared';
import { ASSET_PATHS } from './artifacts';

export const STAGE_ATTEMPTS = 2;
export const EMPTY_JSON_ERROR = 'the answer was not a JSON object';

/** The first model stage: plan, ER source and DDL for the checked design. */
export function designPrompt(topic: string): string {
  return `STAGE:design\nPropose a small database pet-project from the topic: ${topic}.\nReturn one English JSON object with: title (string), summary (one factual paragraph), assumptions (1-6 short strings), features (2-8 short strings), tables (2-8 objects). Describe only what this project contains; do not fabricate citations or claim there is a running application.\nEach table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[]. Every column: name, type (INTEGER|BIGINT|SMALLINT|REAL|NUMERIC|TEXT|VARCHAR|BOOLEAN|DATE|TIMESTAMP), primaryKey:boolean, nullable:boolean, unique:boolean, length:number|null, defaultValue: a JSON string/number/boolean value (not SQL text) or null, references:{"table":string,"column":string}|null, comment (English). Each index: name, columns:[...], unique:boolean, comment. Every table has a non-null primary key. List parent tables BEFORE referencing children, references point only to an earlier table's primary/unique column of the SAME type. At least one meaningful foreign key. checks always []. Also return mermaid: one string holding the complete Mermaid erDiagram source for these exact tables (escape newlines as \\n). Start with "erDiagram"; give every table one "table_name {" block with one "TYPE column_name PK, FK, UK" line per column, listing only the markers that apply and separating multiple markers with commas. Give every foreign key one relationship line "parent ||--o{ child : column_name". Use the exact table, column and type names from this design; add no comments, directives, click links or extra statements. Also return ddl: one string of PostgreSQL DDL for these exact tables (escape newlines as \\n). Write one create table per table with these exact column types: integer, bigint, smallint, real, numeric, text, varchar(length), boolean, date, timestamp. Add "not null" when nullable is false or the column is a primary key, add "unique" when unique is true and it is not a primary key, and add "default <literal>" when defaultValue is set. Add one "constraint pk_<table> primary key (<columns>)" per table and one "constraint fk_<table>_<column> foreign key (<column>) references <parent> (<parent column>)" per foreign key. Write each index as "create [unique] index <name> on <table> (<columns>)". Use unquoted identifiers, lowercase keywords, no comments, no IF NOT EXISTS, no DROP or ALTER. Answer JSON only.`;
}

/** The second model stage: seed rows, operations, seed SQL and the README. */
export function examplesPrompt(topic: string, design: Design): string {
  return `STAGE:examples\nCreate realistic sample data and useful data operations for ${topic}.\nChecked design JSON:\n${JSON.stringify(design)}\nReturn one English JSON object with: tables (every table, 2-5 rows each, valid keys and cross-table references), operations (2-12 useful pet-project data operations). Each seed table: {"table":"<table name>","rows":[{"column":value}]}. INTEGER and NUMERIC values are JSON numbers; BOOLEAN values booleans; DATE/TIMESTAMP/TEXT/VARCHAR are strings. No SQL syntax in values. Each operation: {"name":"snake_case","title":"English description","tables":["table"],"parameters":["name"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}. Named parameters are :name and need not be columns; each declared parameter must appear in the SQL, and the SQL must not use undeclared parameters. No semicolons inside the statement, no comments, no DDL. Mention every table listed in each operation, and no others. Every statement is parsed and checked against the declared tables and parameters. Also return seedSql: one string with one INSERT per seed table (escape newlines as \\n), written as "insert into <table> (<columns>) values (<literals>), ...;". Use numbers unquoted, true/false for booleans, NULL for null, and single-quoted strings with doubled internal quotes. Use only the checked values; no comments, no ON CONFLICT, no RETURNING. Also return readme: one string holding the complete project README for this design (escape newlines as \\n), with a top-level title and these level-two sections: ${README_SECTIONS.join(', ')}. Embed the checked Mermaid source in a mermaid fence and include the "### ${README_FALLBACK}" subsection. Link only to ${ASSET_PATHS.join(', ')}; no raw HTML, external links or images. Answer JSON only.`;
}

/** The model review that compares all four artifacts with the checked data. */
export function judgePrompt(
  topic: string,
  design: Design,
  examples: Examples,
): string {
  return `STAGE:judge\nReview these checked data and generated artifacts for ${topic}.\nDesign: ${JSON.stringify(design)}\nExamples: ${JSON.stringify(examples)}\nReturn one English JSON object with matches (boolean) and problems (array of short strings). Set matches true only if ddl creates exactly the design tables, columns, types, nullability, defaults, keys, foreign keys and indexes, seedSql inserts exactly the checked rows, each operation statement is plausible for its declared tables and parameters, and readme accurately documents the checked design, seed rows, operations and embedded ER source. Otherwise list the concrete problems. Answer JSON only.`;
}
