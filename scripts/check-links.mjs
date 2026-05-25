import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (/\.(md|mdx)$/.test(item.name)) files.push(full);
  }
}
walk('src/content');
let failed = false;
for (const file of files) {
  const result = spawnSync('npx', ['markdown-link-check', file, '--quiet'], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log('Markdown link check passed.');
