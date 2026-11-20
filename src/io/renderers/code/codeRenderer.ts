import type { CodeFile } from '../../../project';
import { CODE_LAYOUT } from './layout';
import {
  databaseModule,
  queriesScript,
  repositoriesModule,
  schemaModule,
  servicesModule,
} from './modules';
import type { CodeFileDescriptor, RenderCodeOptions } from './types';

/** The files of the code skeleton, in a stable order. */
const SKELETON: readonly CodeFileDescriptor[] = [
  {
    id: 'code_database',
    path: CODE_LAYOUT.database,
    summary: '{topic}: database layer.',
  },
  {
    id: 'code_schema',
    path: CODE_LAYOUT.schema,
    summary: '{topic}: schema.',
  },
  {
    id: 'code_repositories',
    path: CODE_LAYOUT.repositories,
    summary: '{topic}: repositories.',
  },
  {
    id: 'code_services',
    path: CODE_LAYOUT.services,
    summary: '{topic}: services.',
  },
  {
    id: 'code_queries',
    path: CODE_LAYOUT.queries,
    summary: '{topic}: queries.',
  },
];

/** One renderer per file id — no defaults, no silent empty files. */
const RENDERERS: Readonly<
  Record<string, (options: RenderCodeOptions) => string>
> = {
  code_database: databaseModule,
  code_schema: ({ model }) => schemaModule(model),
  code_repositories: ({ model }) => repositoriesModule(model),
  code_services: servicesModule,
  code_queries: queriesScript,
};

/** The files of the code skeleton, rendered from checked data. */
export function renderCodeFiles(options: RenderCodeOptions): CodeFile[] {
  return SKELETON.map((file) => ({
    id: file.id,
    path: file.path,
    summary: file.summary.replace('{topic}', options.topic),
    content: RENDERERS[file.id](options),
  }));
}
