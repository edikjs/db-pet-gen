import type {
  CodeFile,
  CodePlan,
  DataModel,
  ProjectPlan,
  SeedData,
} from '../../../shared';

export type SmokeStatus = 'passed' | 'failed' | 'skipped';

export interface SmokeReport {
  readonly status: SmokeStatus;
  readonly reason?: string | null;
  readonly rowCounts: Readonly<Record<string, number>>;
}

/** Checked data and generated assets used to document a run. */
export interface ReadmeInput {
  readonly topic: string;
  readonly plan: ProjectPlan;
  readonly model: DataModel;
  readonly seed: SeedData;
  readonly codePlan: CodePlan;
  readonly codeFiles: readonly CodeFile[];
  readonly diagram: string;
  readonly smoke: SmokeReport;
}

/** A generated code file and its safe relative link, when it has one. */
export interface CodeLink {
  readonly file: CodeFile;
  readonly path: string | undefined;
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
  readonly links: readonly CodeLink[];
  readonly queriesPath: string | undefined;
  readonly relationships: readonly Relationship[];
  readonly seedCounts: ReadonlyMap<string, number>;
}

/** A README section returns typed markdown nodes, never raw prose. */
export type ReadmeSection = (context: ReadmeContext) => readonly BlockNode[];

export interface TextNode {
  readonly type: 'text';
  readonly value: string;
}

export interface InlineCodeNode {
  readonly type: 'inlineCode';
  readonly value: string;
}

export interface StrongNode {
  readonly type: 'strong';
  readonly children: readonly InlineNode[];
}

export interface LinkNode {
  readonly type: 'link';
  readonly url: string;
  readonly children: readonly InlineNode[];
}

export type InlineNode = TextNode | InlineCodeNode | StrongNode | LinkNode;

export interface HeadingNode {
  readonly type: 'heading';
  readonly depth: number;
  readonly children: readonly InlineNode[];
}

export interface ParagraphNode {
  readonly type: 'paragraph';
  readonly children: readonly InlineNode[];
}

export interface CodeBlockNode {
  readonly type: 'code';
  readonly lang: string;
  readonly value: string;
}

export interface ListItemNode {
  readonly type: 'listItem';
  readonly children: readonly BlockNode[];
}

export interface ListNode {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly spread: boolean;
  readonly children: readonly ListItemNode[];
}

export type BlockNode = HeadingNode | ParagraphNode | CodeBlockNode | ListNode;

/** One entity of the typed ER diagram. */
export interface ErAttribute {
  readonly type: string;
  readonly name: string;
  readonly keys: readonly string[];
}

/** One entity of the typed ER diagram. */
export interface ErEntity {
  readonly name: string;
  readonly attributes: readonly ErAttribute[];
}

/** One foreign-key relationship of the typed ER diagram. */
export interface ErRelationship {
  readonly parent: string;
  readonly child: string;
  readonly column: string;
  readonly parentCardinality: string;
  readonly childCardinality: string;
}

/** The typed source of a Mermaid ER diagram. */
export interface ErDiagram {
  readonly entities: readonly ErEntity[];
  readonly relationships: readonly ErRelationship[];
}
