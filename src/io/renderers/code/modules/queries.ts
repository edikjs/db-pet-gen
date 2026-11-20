import { joinLines, separated, Source } from '../../shared/source';
import { when } from '../../shared/text';
import { analyzeOperation } from '../analysis';
import { tsComment } from './comments';
import type { OperationInfo, RenderCodeOptions } from '../types';

/** One commented statement of the query listing. */
function queryBlock(info: OperationInfo): string {
  const { operation } = info;
  const parameters = when(
    operation.parameters.length > 0,
    `\n-- Parameters: ${separated(operation.parameters, ', ')}`,
  );

  return joinLines([
    `-- ${tsComment(operation.title)}`,
    `-- Tables: ${separated(operation.tables, ', ')}${parameters ?? ''}`,
    `${info.statement};`,
  ]);
}

/** The key queries of the plan, in one SQL file. */
export function queriesScript({ plan, model }: RenderCodeOptions): string {
  const blocks = plan.operations
    .map((operation) => analyzeOperation(operation, model))
    .map(queryBlock);

  return new Source()
    .add(['-- Queries.', '', separated(blocks, '\n\n'), ''])
    .toString();
}
