import { toMarkdown } from 'mdast-util-to-markdown';
import type { BlockNode } from './types';

type SerializerTree = Parameters<typeof toMarkdown>[0];

/**
 * The only bridge to the Markdown library: our typed nodes are structurally
 * the nodes the serializer expects, so no model text ever becomes a raw string
 * outside of typed text nodes.
 */
export function serialize(nodes: readonly BlockNode[]): string {
  const tree = { type: 'root', children: nodes } as SerializerTree;
  return `${toMarkdown(tree).trimEnd()}\n`;
}
