import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../../src/lib/catalog-mode.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

/** The real catalogue-mode helper, bound to the same fictional env as the module under test. */
export function catalogMode(env) {
  const module = { exports: {} };
  new vm.Script(source).runInContext(vm.createContext({ module, exports: module.exports, process: { env } }));
  return module.exports;
}
