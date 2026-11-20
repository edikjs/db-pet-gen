import { QuoteUtils } from '@pgsql/quotes';
import { escape as escapeHtml } from 'es-toolkit';
import { collapse } from 'string-collapse-white-space';
import type { SeedValue } from '../../../project';
import type { OptionalLine } from './types';

const LABELS: Readonly<Record<string, string>> = { true: 'Yes', false: 'No' };
const FLAGS: Readonly<Record<string, string>> = {
  true: 'TRUE',
  false: 'FALSE',
};

/** Replaces line breaks and repeated spaces with one space. */
export function oneLine(value: string): string {
  const flat = value.split('\n').join(' ').split('\r').join(' ');
  return collapse(flat).result;
}

const SPACE_CHARACTERS: readonly string[] = [' ', '\n', '\r', '\t'];

/** Escapes untrusted prose, keeping one intentional boundary space. */
export function prose(value: string): string {
  const leading = SPACE_CHARACTERS.some((char) => value.startsWith(char))
    ? ' '
    : '';
  const trailing = SPACE_CHARACTERS.some((char) => value.endsWith(char))
    ? ' '
    : '';
  return `${leading}${escapeHtml(oneLine(value))}${trailing}`;
}

/** A TypeScript string literal built by the language-aware JSON encoder. */
export function tsString(value: string): string {
  return JSON.stringify(value);
}

/** A SQL literal built by the PostgreSQL quoting library. */
export function sqlLiteral(value: SeedValue): string {
  switch (typeof value) {
    case 'number':
      return String(value);
    case 'boolean':
      return FLAGS[String(value)];
    case 'string':
      return QuoteUtils.escape(value);
    case 'object':
      return 'NULL';
  }
}

/** `Yes` / `No` for a documented flag. */
export function yesNo(value: boolean): string {
  return LABELS[String(value)];
}

/** A line only when a condition holds; otherwise nothing. */
export function when(condition: boolean, value: string): OptionalLine {
  return condition ? value : undefined;
}

/** Rejects absent fragments before they reach a rendered document. */
export function present<T>(value: T | undefined): value is T {
  return value !== undefined;
}
