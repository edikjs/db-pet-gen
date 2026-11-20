import { oneLine } from '../../shared/text';

/** A checked string that cannot close a generated JSDoc comment. */
export function tsComment(text: string): string {
  return oneLine(text).split('*/').join('* /');
}
