import { design, diagram } from '../../../test-support';
import { validateDiagram } from './validateDiagram';

describe('validateDiagram', () => {
  it('accepts model-written Mermaid that matches the design', async () => {
    expect(await validateDiagram(diagram, design)).toEqual([]);
  });

  it('rejects space-separated key markers that real Mermaid cannot parse', async () => {
    const issues = await validateDiagram(
      diagram.replace('INTEGER id PK', 'INTEGER id PK UK'),
      design,
    );
    expect(issues.join(' ')).toContain('Invalid Mermaid');
  });

  it('rejects directives, links and markup', async () => {
    const injected = `erDiagram
%%{init: {"securityLevel": "loose"}}%%
owners {
  INTEGER id PK
  TEXT name
}
pets {
  INTEGER id PK
  INTEGER owner_id FK
  TEXT name
}
click owners "https://bad.example"
owners ||--o{ pets : owner_id
`;
    const issues = await validateDiagram(injected, design);
    expect(issues.join(' ')).toContain('Forbidden Mermaid statement');
    expect(issues.join(' ')).toContain('click owners');
  });

  it('rejects a diagram that omits a design table', async () => {
    const issues = await validateDiagram(
      `erDiagram
owners {
  INTEGER id PK
  TEXT name
}
`,
      design,
    );
    expect(issues).toContain(
      'Diagram entities must match the design tables exactly.',
    );
  });

  it('rejects wrong key markers on a design column', async () => {
    const issues = await validateDiagram(
      diagram.replace('INTEGER owner_id FK', 'INTEGER owner_id'),
      design,
    );
    expect(issues.join(' ')).toContain('key markers');
  });

  it('rejects relationships that are not design foreign keys', async () => {
    const issues = await validateDiagram(
      `${diagram}owners ||--o{ owners : id\n`,
      design,
    );
    expect(issues).toContain(
      'Diagram relationships must match the design foreign keys.',
    );
  });

  it('rejects a diagram that is not an ER diagram', async () => {
    const issues = await validateDiagram('graph TD\nA --> B', design);
    expect(issues.join(' ')).toContain('must start with erDiagram');
    expect(issues.join(' ')).toContain('must be an ER diagram');
  });
});
