import { serialize } from '../serialize';
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

/** The documented project, serialized from typed nodes. */
export function renderReadme(input: ReadmeInput): string {
  const context = readmeContext(input);
  return serialize(SECTIONS.flatMap((section) => section(context)));
}
