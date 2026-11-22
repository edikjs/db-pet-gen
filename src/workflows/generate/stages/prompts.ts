import type { Design, Examples } from '../domain';
import { ASSET_PATHS, OPERATIONS_PATH, columnValues } from '../domain';
import { README_FALLBACK, README_SECTIONS } from '../rules';
import { stageMessages } from './messages';

export function designPrompt(topic: string) {
  return stageMessages(
    `STAGE:design
Propose a small database pet-project from the supplied topic. Return one English JSON object with title (string), summary (one factual paragraph), assumptions (1-6 short strings), features (2-8 short strings), tables (2-8 objects) and ddl. Describe only what this project contains; do not fabricate citations or claim there is a running application.
Each table: name (snake_case), comment (English), columns (nonempty), checks:[], indexes:[]. Every column: name, type (${Object.keys(columnValues).join('|')}), primaryKey:boolean, nullable:boolean, unique:boolean, length:number|null, defaultValue: a JSON string/number/boolean value (not SQL text) or null, references:{"table":string,"column":string}|null, comment (English). Each index: name, columns:[...], unique:boolean, comment. Every table has a non-null primary key. List parent tables BEFORE referencing children; references point only to an earlier table's primary/unique column of the SAME type. At least one meaningful foreign key. checks always [].
ddl: one string of PostgreSQL DDL. Write one create table per design table using its exact column types in lowercase; render VARCHAR as varchar(length). Add "not null" when nullable is false or the column is a primary key, "unique" when unique is true and it is not a primary key, and "default <literal>" when defaultValue is set. Add one "constraint pk_<table> primary key (<columns>)" per table and one "constraint fk_<table>_<column> foreign key (<column>) references <parent> (<parent column>)" per foreign key. Write each index as "create [unique] index <name> on <table> (<columns>)". Use unquoted identifiers, lowercase keywords, no comments, no IF NOT EXISTS, no DROP or ALTER.`,
    { topic },
  );
}

export function examplesPrompt(topic: string, design: Design) {
  return stageMessages(
    `STAGE:examples
Create realistic sample data and useful data operations for the supplied topic and design. Return one English JSON object with tables (every design table in order, 2-5 rows each, valid keys and cross-table references), operations (2-12 useful pet-project data operations) and readme.
Each seed table: {"table":"<table name>","rows":[{"column":value}]}. Include every design column in every row, even nullable or defaulted columns. Respect non-null columns, primary keys, unique keys and foreign keys. INTEGER and NUMERIC values are JSON numbers; BOOLEAN values booleans; DATE/TIMESTAMP/TEXT/VARCHAR are strings. No SQL syntax in values.
Each operation: {"name":"snake_case","title":"English description","tables":["table"],"parameters":["name"],"statement":"one SELECT, INSERT, UPDATE or DELETE statement"}. Named parameters are :name and need not be columns; each declared parameter must appear in the SQL, and the SQL must not use undeclared parameters. No semicolons inside the statement, no comments, no DDL. Mention every table listed in each operation, and no others.
readme: one string holding the complete project README with a top-level title and these level-two sections: ${README_SECTIONS.join(', ')}. In "Operations and queries", link to [Operation SQL](${OPERATIONS_PATH}) and describe the supplied operations and their parameters. Embed the exact checked Mermaid source in a single mermaid fence and include the "### ${README_FALLBACK}" subsection. Link only to ${ASSET_PATHS.join(', ')}; no raw HTML, external links or images.`,
    { topic, design },
  );
}

export function judgePrompt(topic: string, design: Design, examples: Examples) {
  return stageMessages(
    `STAGE:judge
Review the supplied artifacts against the design and examples. Return one English JSON object with matches (boolean) and problems (array of short strings). Set matches true with an empty problems list only if ddl creates exactly the design tables, columns, types, nullability, defaults, keys, foreign keys and indexes, seedSql inserts exactly the checked rows, operationsSql contains the checked operations in order, each operation statement is plausible for its declared tables and parameters, and readme accurately documents the checked design, seed rows, operations and embedded ER source. Otherwise set matches false and list the concrete problems.`,
    { topic, design, examples },
  );
}
