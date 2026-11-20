import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { codePlan, dataModel } from '../../../test-support/fixture';
import { renderCodeFiles } from './codeRenderer';

describe('deterministic code skeleton', () => {
  it('uses schema tables, checked operations and valid TypeScript syntax', () => {
    const files = renderCodeFiles({
      plan: codePlan,
      model: dataModel,
      topic: 'Pet records',
    });
    expect(files.map((file) => file.path)).toEqual([
      'code/database.ts',
      'code/schema.ts',
      'code/repositories.ts',
      'code/services.ts',
      'code/queries.sql',
    ]);
    expect(
      files.find((file) => file.id === 'code_services')?.content,
    ).toContain('listPetsByOwner');
    for (const file of files.filter((item) => item.path.endsWith('.ts'))) {
      const result = ts.transpileModule(file.content, {
        fileName: file.path,
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      });
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('typechecks the generated TypeScript modules together', async () => {
    const root = await mkdtemp(join(tmpdir(), 'db-pet-code-'));
    try {
      const files = renderCodeFiles({
        plan: codePlan,
        model: dataModel,
        topic: 'Pet records',
      }).filter((file) => file.path.endsWith('.ts'));
      const paths: string[] = [];
      for (const file of files) {
        const path = join(root, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content, 'utf8');
        paths.push(path);
      }
      const program = ts.createProgram(paths, {
        strict: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        types: ['node'],
        typeRoots: [join(process.cwd(), 'node_modules/@types')],
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          ),
      ).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
