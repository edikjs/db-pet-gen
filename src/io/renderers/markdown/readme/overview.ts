import {
  bullets,
  heading,
  paragraph,
  proseParagraph,
  proseText,
} from '../nodes';
import type { ReadmeSection } from '../types';

/** The title, summary, assumptions and features of the project. */
export const overviewSection: ReadmeSection = ({ input }) => [
  heading(1, input.plan.title),
  heading(2, 'Project overview'),
  proseParagraph(input.plan.summary),
  paragraph([proseText('Topic: '), proseText(input.topic), proseText('.')]),
  heading(3, 'Assumptions'),
  bullets(input.plan.assumptions),
  heading(3, 'Features'),
  bullets(input.plan.features),
];
