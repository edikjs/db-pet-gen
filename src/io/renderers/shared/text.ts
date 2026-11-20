import { escape as escapeHtml } from 'es-toolkit';
import { collapse } from 'string-collapse-white-space';
import type { OptionalLine } from './types';

const LABELS: Readonly<Record<string, string>> = { true: 'Yes', false: 'No' };
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

/** `Yes` / `No` for a documented flag. */
export function yesNo(value: boolean): string {
  return LABELS[String(value)];
}

/** A line only when a condition holds; otherwise nothing. */
export function when(condition: boolean, value: string): OptionalLine {
  return condition ? value : undefined;
}
