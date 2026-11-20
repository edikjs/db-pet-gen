/** A named database object used by the naming helpers. */
export interface NamedObject {
  readonly name: string;
}

/** A value that may be absent from a rendered line. */
export type OptionalLine = string | undefined;
