import { redact as redactSecrets } from 'flare-redact';

/** Renders an unknown thrown value as its loggable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Removes secrets from provider text before it is reported or shown. */
export function redact(value: string): string {
  return redactSecrets(value.slice(0, 500), { mask: '[REDACTED]' });
}

/**
 * Prints a recovered model-call failure to stderr.
 *
 * Retries happen inside the model client, so a refused call is otherwise
 * invisible until the run finally fails. The line is labelled and redacted;
 * no stack is printed, because one per retry would bury the run's output.
 */
export function reportDiagnostic(label: string, detail: string): void {
  console.error(`[db-pet-gen] ${label}: ${redact(detail)}`);
}
