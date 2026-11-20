/** The single place where generated lines become a text document. */
export class Source {
  private readonly content: string[] = [];

  /** Appends each line of a block, preserving the caller's order. */
  add(block: readonly string[]): this {
    block.forEach((line) => this.content.push(line));
    return this;
  }

  append(line: string): this {
    return this.add([line]);
  }

  blank(): this {
    return this.append('');
  }

  toString(): string {
    return joinLines(this.content);
  }
}

/** Joins lines without scattering `join` calls through the renderers. */
export function joinLines(values: readonly string[]): string {
  return values.join('\n');
}

/** Joins fragments with a separator chosen by the caller. */
export function separated(
  values: readonly string[],
  separator: string,
): string {
  return values.join(separator);
}

/** Concatenates fragments without a separator. */
export function concatenated(values: readonly string[]): string {
  return values.join('');
}

/** Renders the fields of a generated object literal, one field per line. */
export function objectFields(
  fields: readonly { readonly name: string; readonly value: string }[],
  indent: string,
): string {
  return joinLines(
    fields.map((field) => `${indent}${field.name}: ${field.value},`),
  );
}
