import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { GenerationModel } from '../llm';
import type {
  DataModel,
  Design,
  Examples,
  Operations,
  ProjectPlan,
  SeedData,
} from '../shared';

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

export const design: Design = { ...projectPlan, ...dataModel };

export const examples: Examples = { ...seedData, ...operations };

export class FixtureModel implements GenerationModel {
  readonly calls: string[] = [];
  constructor(private readonly failStage?: string) {}

  async invoke(messages: BaseMessage[]): Promise<BaseMessage> {
    const text = String(messages[0]?.content ?? '');
    const stage = /STAGE:(\w+)/u.exec(text)?.[1] ?? 'unknown';
    this.calls.push(stage);
    if (stage === this.failStage)
      throw new Error(`simulated model outage: ${stage}`);
    const answers: Record<string, unknown> = { design, examples };
    return new AIMessage(JSON.stringify(answers[stage]));
  }
}
