import { readdirSync,readFileSync } from 'node:fs';
import {parseDocument} from 'yaml';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function check(file) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules','dist'].includes(entry.name)) walk(file);
    else if (/\.(js|mjs)$/.test(entry.name)) check(file);
  }
}
walk('server');
walk('scripts');
walk('client');
check('vitest.config.js');
console.log('JavaScript syntax checks passed.');

for(const file of readdirSync('.github/workflows')){
 const doc=parseDocument(readFileSync(join('.github/workflows',file),'utf8'));
 if(doc.errors.length)throw new Error('Invalid workflow YAML: '+file);
}
console.log('Workflow YAML checks passed.');
