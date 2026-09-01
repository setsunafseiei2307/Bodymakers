import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = { commit, shortCommit: commit.slice(0, 7), builtAt: new Date().toISOString() };
mkdirSync('dist', { recursive: true });
writeFileSync('dist/build-info.json', `${JSON.stringify(output)}\n`);
