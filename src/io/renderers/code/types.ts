import type {
  CodeOperation,
  CodePlan,
  DataColumn,
  DataModel,
  DataTable,
} from '../../../project';

/** One file of the code skeleton: its id, its path and its summary. */
export interface CodeFileDescriptor {
  /** Stable id of a generated code file. */
  readonly id: string;
  /** The path of the file inside the assets directory of the run. */
  readonly path: string;
  /** One line: what the file holds — `{topic}` is the project topic. */
  readonly summary: string;
}

/** Checked input of the code renderer. */
export interface RenderCodeOptions {
  readonly plan: CodePlan;
  readonly model: DataModel;
  readonly topic: string;
}

/** The statement types the parser can report. */
export type StatementKind =
  'select' | 'insert' | 'update' | 'delete' | 'unknown';

/** The value a service function returns. */
export type ServiceShape = 'nothing' | 'rows' | 'records';

/** Everything the service and query renderers need to know about an operation. */
export interface OperationInfo {
  readonly operation: CodeOperation;
  readonly statement: string;
  readonly kind: StatementKind;
  readonly reads: boolean;
  readonly returnsRows: boolean;
  readonly typedRow: boolean;
  readonly table: DataTable | undefined;
  readonly columnByParameter: ReadonlyMap<string, DataColumn>;
}
