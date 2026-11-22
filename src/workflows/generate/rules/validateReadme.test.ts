import { diagram, readme } from '../../../adapters/testing';
import { validateReadme } from './validateReadme';

const availablePaths = [
  'assets/ddl/schema.sql',
  'assets/seed/seed.sql',
  'assets/operations/operations.sql',
  'assets/diagrams/er.mmd',
];

describe('README validation', () => {
  it('recognizes CommonMark fences inside block quotes and ignores indented code', () => {
    expect(
      validateReadme(
        `${readme}\n> ~~~sql\n> select 1\n`,
        availablePaths,
        diagram,
      ),
    ).toContain('Unclosed Markdown code fence.');
    expect(
      validateReadme(
        `${readme}\nLiteral example:\n\n    ~~~\n`,
        availablePaths,
        diagram,
      ),
    ).toEqual([]);
  });
  it('accepts a model-written README with checked sections and links', () => {
    expect(validateReadme(readme, availablePaths, diagram)).toEqual([]);
    expect(
      validateReadme(
        readme.replace('TEXT `name`', 'TEXT `label`'),
        availablePaths,
        diagram,
      ),
    ).not.toEqual([]);
  });

  it('reports raw HTML and still checks targets nested in a blockquote', () => {
    expect(
      validateReadme(
        `${readme}\n\n<script>alert(1)</script>\n\n> - [external](https://bad.example)\n> - ![image](../secret.png)\n`,
        availablePaths,
        diagram,
      ),
    ).toEqual([
      'Raw HTML is not allowed.',
      'Non-relative README link: https://bad.example',
      'Non-relative README link: ../secret.png',
    ]);
  });

  it('rejects a missing section and an unclosed fence', () => {
    expect(
      validateReadme(
        readme.replace('## Limitations', '## Other'),
        availablePaths,
        diagram,
      ),
    ).toContain('Missing section: Limitations.');
    expect(
      validateReadme(`${readme}\n\`\`\`sql\n`, availablePaths, diagram),
    ).toContain('Unclosed Markdown code fence.');
  });
});
