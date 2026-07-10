#!/usr/bin/env node
/**
 * Regenerates deploy/crd.yaml from pkg/rancher-feedback/services/crd.ts, which is the
 * single source of truth — the extension also uses that module to bootstrap the CRD at
 * runtime, so the YAML you apply and the YAML the UI creates can never disagree.
 *
 * Run: yarn gen-crd
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const ts = require('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = resolve(root, 'pkg/rancher-feedback');
const target = resolve(root, 'deploy/crd.yaml');

/**
 * Transpiles a TS module and evaluates it in-process, resolving relative imports the
 * same way. Enough for these two plain-data modules; not a general-purpose loader.
 */
function loadTsModule(absPath) {
  const filename = absPath.endsWith('.ts') ? absPath : `${ absPath }.ts`;

  const transpiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

  const module_ = { exports: {} };
  const localRequire = (id) => {
    if (!id.startsWith('.')) {
      throw new Error(`gen-crd: unexpected bare import "${ id }" in ${ filename }`);
    }

    return loadTsModule(resolve(dirname(filename), id));
  };

  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', transpiled)(module_.exports, localRequire, module_);

  return module_.exports;
}

const { FEEDBACK_CRD } = loadTsModule(resolve(pkg, 'services/crd.ts'));

const header = `# GENERATED FILE — do not edit.
# Source: pkg/rancher-feedback/services/crd.ts
# Regenerate with: yarn gen-crd
#
# Apply with:
#   kubectl apply -f deploy/namespace.yaml -f deploy/crd.yaml -f deploy/rbac.yaml
`;

writeFileSync(target, header + yaml.dump(FEEDBACK_CRD, { lineWidth: 110, noRefs: true }));

console.log(`Wrote ${ target }`); // eslint-disable-line no-console
