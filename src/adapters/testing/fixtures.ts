import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatTransport } from '../llm';
import type {
  DataModel,
  Design,
  Judge,
  Operations,
  ProjectPlan,
  SeedData,
} from '../../workflows/generate/domain';

export const projectPlan: ProjectPlan = {
  title: 'Pet records',
  summary:
    'A small catalogue that records pet owners and the animals in their care.',
  assumptions: ['Each animal has exactly one registered owner.'],
  features: ['List pets by their owner.', 'Remove an outdated pet record.'],
};

export const dataModel: DataModel = {
  tables: [
    {
      name: 'owners',
      comment: 'People responsible for pets',
      checks: [],
      indexes: [],
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          primaryKey: true,
          nullable: false,
          unique: false,
          length: null,
          defaultValue: null,
          references: null,
          comment: 'Owner identifier',
        },
        {
          name: 'name',
          type: 'TEXT',
          primaryKey: false,
          nullable: false,
          unique: false,
          length: null,
          defaultValue: null,
          references: null,
          comment: 'Full name',
        },
      ],
    },
    {
      name: 'pets',
      comment: 'Animals registered in the system',
      checks: [],
      indexes: [
        {
          name: 'idx_pets_owner',
          columns: ['owner_id'],
          unique: false,
          comment: 'Quickly look up the owner',
        },
      ],
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          primaryKey: true,
          nullable: false,
          unique: false,
          length: null,
          defaultValue: null,
          references: null,
          comment: 'Pet identifier',
        },
        {
          name: 'owner_id',
          type: 'INTEGER',
          primaryKey: false,
          nullable: false,
          unique: false,
          length: null,
          defaultValue: null,
          references: { table: 'owners', column: 'id' },
          comment: 'Registered owner',
        },
        {
          name: 'name',
          type: 'TEXT',
          primaryKey: false,
          nullable: false,
          unique: false,
          length: null,
          defaultValue: null,
          references: null,
          comment: 'Pet name',
        },
      ],
    },
  ],
};

export const seedData: SeedData = {
  tables: [
    {
      table: 'owners',
      rows: [
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Sam' },
      ],
    },
    {
      table: 'pets',
      rows: [
        { id: 10, owner_id: 1, name: 'Milo' },
        { id: 11, owner_id: 2, name: 'Poppy' },
      ],
    },
  ],
};

export const operations: Operations = {
  operations: [
    {
      name: 'list_pets_by_owner',
      title: 'Find pets for an owner',
      tables: ['pets'],
      parameters: ['owner_id'],
      statement:
        'SELECT id, owner_id, name FROM pets WHERE owner_id = :owner_id',
    },
    {
      name: 'remove_pet',
      title: 'Remove a pet record',
      tables: ['pets'],
      parameters: ['id'],
      statement: 'DELETE FROM pets WHERE id = :id',
    },
  ],
};

export const diagram = `erDiagram
"owners" {
  INTEGER \`id\` PK
  TEXT \`name\`
}
"pets" {
  INTEGER \`id\` PK
  INTEGER \`owner_id\` FK
  TEXT \`name\`
}
"owners" ||--o{ "pets" : "owner_id"
`;

export const ddl = `create table "owners" ("id" integer not null, "name" text not null, constraint "pk_owners" primary key ("id"));
create table "pets" ("id" integer not null, "owner_id" integer not null, "name" text not null, constraint "pk_pets" primary key ("id"), constraint "fk_pets_owner_id" foreign key ("owner_id") references "owners" ("id"));
create index "idx_pets_owner" on "pets" ("owner_id");
`;

export const seedSql = `insert into "owners" ("id", "name") values (1, 'Ada'), (2, 'Sam');
insert into "pets" ("id", "owner_id", "name") values (10, 1, 'Milo'), (11, 2, 'Poppy');
`;

export const operationsSql = `-- list_pets_by_owner
SELECT id, owner_id, name FROM pets WHERE owner_id = :owner_id;

-- remove_pet
DELETE FROM pets WHERE id = :id;
`;

export const readme = `# Pet records

## Project overview

A small catalogue that records pet owners and the animals in their care.

Topic: Pet records.

### Assumptions

- Each animal has exactly one registered owner.

### Features

- List pets by their owner.
- Remove an outdated pet record.

## Design

The model has 2 tables. Primary keys identify rows; declared foreign keys connect child rows to their referenced parent rows.

## ER diagram

Mermaid source: [assets/diagrams/er.mmd](assets/diagrams/er.mmd).

\`\`\`mermaid
${diagram.trimEnd()}
\`\`\`

### Relationships (text alternative)

- \`pets.owner_id\` → \`owners.id\` (required parent; many children per parent).

## Data dictionary

### owners

People responsible for pets.

#### Columns

- \`id\` — INTEGER; PK: Yes; FK: —; nullable: No; unique: No; default: —; description: Owner identifier.
- \`name\` — TEXT; PK: No; FK: —; nullable: No; unique: No; default: —; description: Full name.

#### Explicit indexes

- None declared.

### pets

Animals registered in the system.

#### Columns

- \`id\` — INTEGER; PK: Yes; FK: —; nullable: No; unique: No; default: —; description: Pet identifier.
- \`owner_id\` — INTEGER; PK: No; FK: owners.id; nullable: No; unique: No; default: —; description: Registered owner.
- \`name\` — TEXT; PK: No; FK: —; nullable: No; unique: No; default: —; description: Pet name.

#### Explicit indexes

- \`idx_pets_owner\` on \`owner_id\` (non-unique).

## Sample data

The seed script is [assets/seed/seed.sql](assets/seed/seed.sql). These counts describe generated rows, not a live database:

- \`owners\`: 2 seed rows
- \`pets\`: 2 seed rows

#### owners records

\`\`\`json
[
  { "id": 1, "name": "Ada" },
  { "id": 2, "name": "Sam" }
]
\`\`\`

#### pets records

\`\`\`json
[
  { "id": 10, "owner_id": 1, "name": "Milo" },
  { "id": 11, "owner_id": 2, "name": "Poppy" }
]
\`\`\`

## PostgreSQL setup

Use the schema [assets/ddl/schema.sql](assets/ddl/schema.sql) and then the seed script [assets/seed/seed.sql](assets/seed/seed.sql) on a fresh database.

\`\`\`sh
createdb db_pet_gen_demo
psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/ddl/schema.sql
psql -v ON_ERROR_STOP=1 -d db_pet_gen_demo -f assets/seed/seed.sql
\`\`\`

## Operations and queries

See the [operation SQL](assets/operations/operations.sql).

Named parameters such as \`:owner_id\` require application binding before running in \`psql\`.

Operation: \`list_pets_by_owner\`. Tables: \`pets\`. Parameters: \`owner_id\`.

\`\`\`sql
SELECT id, owner_id, name FROM pets WHERE owner_id = :owner_id
\`\`\`

Operation: \`remove_pet\`. Tables: \`pets\`. Parameters: \`id\`.

\`\`\`sql
DELETE FROM pets WHERE id = :id
\`\`\`

## Limitations

- The DDL and seed files are setup scripts, not a packaged application.
- Operation statements are parsed and checked, but not executed against a live database.
`;

const designAnswer = {
  ...projectPlan,
  ...dataModel,
  ddl,
};
export const design: Design = { ...designAnswer, mermaid: diagram };

export const examples = {
  ...seedData,
  ...operations,
  readme,
};

export const judge: Judge = { matches: true, problems: [] };

export class FixtureModel implements ChatTransport {
  readonly calls: string[] = [];
  constructor(private readonly failStage?: string) {}

  async invoke(messages: BaseMessage[]): Promise<BaseMessage> {
    const text = String(messages[0]?.content ?? '');
    const stage =
      text.split('\n')[0]?.replace('STAGE:', '').trim() || 'unknown';
    this.calls.push(stage);
    if (stage === this.failStage)
      throw new Error(`simulated model outage: ${stage}`);
    const answers: Record<string, unknown> = {
      design: designAnswer,
      examples,
      judge,
    };
    return new AIMessage(JSON.stringify(answers[stage]));
  }
}
