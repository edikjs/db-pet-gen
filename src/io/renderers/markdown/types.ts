import type { BlockContent, PhrasingContent } from 'mdast';
import type {
  DataModel,
  Operations,
  ProjectPlan,
  SeedData,
} from '../../../shared';

/** Checked data and generated assets used to document a run. */
export interface ReadmeInput {
  readonly topic: string;
  readonly plan: ProjectPlan;
  readonly model: DataModel;
  readonly seed: SeedData;
  readonly operations: Operations;
  readonly diagram: string;
}

/** One declared foreign key, described in prose. */
export interface Relationship {
  readonly child: string;
  readonly column: string;
  readonly parent: string;
  readonly parentColumn: string;
  readonly optional: boolean;
  readonly atMostOne: boolean;
}

/** Derived data shared by every README section. */
export interface ReadmeContext {
  readonly input: ReadmeInput;
  readonly diagram: string;
  readonly relationships: readonly Relationship[];
  readonly seedCounts: ReadonlyMap<string, number>;
}

/** A README section returns typed mdast nodes, never raw prose. */
export type ReadmeSection = (context: ReadmeContext) => readonly BlockNode[];

/** mdast types are the single source of truth for generated Markdown. */
export type BlockNode = BlockContent;
export type InlineNode = PhrasingContent;

/** A key marker of a Mermaid ER attribute. */
export type MermaidErKey = 'PK' | 'FK' | 'UK';

/** A crow's-foot cardinality of a Mermaid ER relationship. */
export type MermaidErCardinality = '||' | 'o|' | 'o{';

/** One attribute of a Mermaid ER entity. */
export interface MermaidErAttribute {
  readonly type: string;
  readonly name: string;
  readonly keys: readonly MermaidErKey[];
}

/** One entity of a Mermaid ER diagram. */
export interface MermaidErEntity {
  readonly name: string;
  readonly attributes: readonly MermaidErAttribute[];
}

/** One foreign-key relationship of a Mermaid ER diagram. */
export interface MermaidErRelationship {
  readonly left: string;
  readonly right: string;
  readonly leftCard: MermaidErCardinality;
  readonly rightCard: MermaidErCardinality;
  readonly identifying: boolean;
  readonly label: string;
}

/** The typed AST the Mermaid printer serializes. */
export interface MermaidErDiagram {
  readonly diagram: 'er';
  readonly entities: readonly MermaidErEntity[];
  readonly relationships: readonly MermaidErRelationship[];
}
