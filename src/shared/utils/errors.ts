import { redact as redactSecrets } from 'flare-redact';

/** Renders an unknown thrown value as its loggable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Removes secrets from provider text before it is reported or shown.
 *
 * The exact API key is masked even if the provider does not recognise it as a
 * secret; `flare-redact` also catches other key-shaped values in the same text.
 */
export function redact(value: string, apiKey?: string): string {
  const masked = apiKey ? value.replaceAll(apiKey, '[REDACTED]') : value;
  return redactSecrets(masked, { mask: '[REDACTED]' }).slice(0, 2000);
}

/**
 * Prints a recovered model-call failure to stderr.
 *
 * Retries happen inside the model client, so a refused call is otherwise
 * invisible until the run finally fails. The line is labelled and redacted;
 * no stack is printed, because one per retry would bury the run's output.
 */
export function reportDiagnostic(
  label: string,
  detail: string,
  apiKey?: string,
): void {
  console.error(`[db-pet-gen] ${label}: ${redact(detail, apiKey)}`);
}
