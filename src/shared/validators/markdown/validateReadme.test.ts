import { readme } from '../../../test-support';
import { validateReadme } from './validateReadme';

const availablePaths = [
  'assets/ddl/schema.sql',
  'assets/seed/seed.sql',
  'assets/diagrams/er.mmd',
];

describe('README validation', () => {
  it('accepts a model-written README with checked sections and links', () => {
    expect(validateReadme(readme, availablePaths)).toEqual([]);
  });

  it('rejects unsafe links and raw HTML', () => {
    expect(
      validateReadme(
        `${readme}\n[external](https://bad.example)\n![image](../secret.png)\n<script>alert(1)</script>\n`,
        availablePaths,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Non-relative README link: https://bad.example',
        'Non-relative README link: ../secret.png',
        'Raw HTML is not allowed.',
      ]),
    );
  });

  it('rejects a missing section and an unclosed fence', () => {
    expect(
      validateReadme(
        readme.replace('## Limitations', '## Other'),
        availablePaths,
      ),
    ).toContain('Missing section: Limitations.');
    expect(validateReadme(`${readme}\n\`\`\`sql\n`, availablePaths)).toContain(
      'Unclosed Markdown code fence.',
    );
  });
});
