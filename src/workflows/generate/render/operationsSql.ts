import type { Operations } from '../domain';

/** Preserve each checked statement and its named parameters in the SQL asset. */
export function renderOperationsSql({ operations }: Operations): string {
  return operations
    .map(({ name, statement }) => {
      const sql = statement.trimEnd();
      const terminated = sql.endsWith(';') ? sql : `${sql};`;
      return `-- ${name}\n${terminated}\n`;
    })
    .join('\n');
}
