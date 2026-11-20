import { oneLine, prose } from '../shared/text';
import type {
  BlockNode,
  CodeBlockNode,
  HeadingNode,
  InlineCodeNode,
  InlineNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  StrongNode,
  TextNode,
} from './types';

/** A literal inline value. */
export function text(value: string): TextNode {
  return { type: 'text', value };
}

/** Escaped model-provided prose. */
export function proseText(value: string): TextNode {
  return text(prose(value));
}

/** Inline code with a single line. */
export function inlineCode(value: string): InlineCodeNode {
  return { type: 'inlineCode', value: oneLine(value) };
}

/** Strong inline text. */
export function strong(value: string): StrongNode {
  return { type: 'strong', children: [proseText(value)] };
}

/** A relative Markdown link. */
export function link(url: string, label: string): LinkNode {
  return { type: 'link', url, children: [text(label)] };
}

/** A section heading. */
export function heading(depth: number, value: string): HeadingNode {
  return { type: 'heading', depth, children: [proseText(value)] };
}

/** A paragraph built from typed inline nodes. */
export function paragraph(children: readonly InlineNode[]): ParagraphNode {
  return { type: 'paragraph', children };
}

/** A paragraph of escaped prose. */
export function proseParagraph(value: string): ParagraphNode {
  return paragraph([proseText(value)]);
}

/** A fenced code block; the serializer picks a safe fence length. */
export function fenced(lang: string, value: string): CodeBlockNode {
  return { type: 'code', lang, value };
}

/** An unordered list of inline items. */
export function bulletList(
  items: readonly (readonly InlineNode[])[],
): ListNode {
  const children: ListItemNode[] = items.map((item) => ({
    type: 'listItem',
    children: [paragraph(item)],
  }));
  return { type: 'list', ordered: false, spread: false, children };
}

/** An unordered list of escaped strings. */
export function bullets(values: readonly string[]): ListNode {
  return bulletList(values.map((value) => [proseText(value)]));
}

/** Inline code labels separated by commas. */
export function codeList(names: readonly string[]): InlineNode[] {
  return names.flatMap((name, index) =>
    index === 0 ? [inlineCode(name)] : [text(', '), inlineCode(name)],
  );
}

/** Blocks that may be absent from a section. */
export function blocks(
  values: readonly (BlockNode | undefined)[],
): BlockNode[] {
  return values.filter((block): block is BlockNode => block !== undefined);
}
