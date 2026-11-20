import { toMarkdown } from 'mdast-util-to-markdown';
import type { Root } from 'mdast';
import type { ReadmeInput, ReadmeSection } from '../types';
import { readmeContext } from './context';
import { dataDictionarySection, designSection, erSection } from './design';
import { limitationsSection, codeMapSection, smokeSection } from './quality';
import { operationsSection, sampleDataSection, setupSection } from './usage';
import { overviewSection } from './overview';

/** The sections of the README, in document order. */
const SECTIONS: readonly ReadmeSection[] = [
  overviewSection,
  designSection,
  erSection,
  dataDictionarySection,
  sampleDataSection,
  setupSection,
  operationsSection,
  codeMapSection,
  smokeSection,
  limitationsSection,
];

/** The documented project, serialized by the mdast Markdown library. */
export function renderReadme(input: ReadmeInput): string {
  const context = readmeContext(input);
  const tree: Root = {
    type: 'root',
    children: SECTIONS.flatMap((section) => section(context)),
  };
  return `${toMarkdown(tree).trimEnd()}\n`;
}
