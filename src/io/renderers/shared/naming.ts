import { pascalCase } from 'es-toolkit';
import { QuoteUtils } from '@pgsql/quotes';
import type { NamedObject } from './types';

interface SuffixRule {
  readonly plural: string;
  readonly singular: string;
}

/** Ordered suffix rules for the entity name held by a table. */
const SINGULAR_RULES: readonly SuffixRule[] = [
  { plural: 'sses', singular: 'ss' },
  { plural: 'ies', singular: 'y' },
  { plural: 'ches', singular: 'ch' },
  { plural: 'shes', singular: 'sh' },
  { plural: 'xes', singular: 'x' },
  { plural: 'ses', singular: 's' },
  { plural: 's', singular: '' },
];

/** The singular entity name of a table. */
export function singular(name: string): string {
  const rule = SINGULAR_RULES.find(
    (candidate) =>
      name.endsWith(candidate.plural) && name.length > candidate.plural.length,
  );
  return rule === undefined
    ? name
    : name.slice(0, -rule.plural.length) + rule.singular;
}

/** The name of the row type generated for a table. */
export function rowTypeName(table: NamedObject): string {
  return `${pascalCase(singular(table.name))}Row`;
}

/** The name of the repository class generated for a table. */
export function repositoryName(table: NamedObject): string {
  return `${pascalCase(table.name)}Repository`;
}

/**
 * True when a name is a plain, lowercase identifier. The quoting library
 * knows which words and characters need quotes, so unsafe Mermaid tokens are
 * never emitted.
 */
export function isPlainIdentifier(name: string): boolean {
  return QuoteUtils.quoteIdentifier(name) === name;
}
