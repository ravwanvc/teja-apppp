import { spawn } from 'node:child_process';
import { readLocalEnv } from './local-env.mjs';

for (const [key, value] of Object.entries(readLocalEnv())) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const command = process.argv[2] === 'dev' ? 'dev' : 'start';
const args = process.argv.slice(3)
  .filter((arg) => arg !== '--strictPort')
  .map((arg) => arg === '--host' ? '--hostname' : arg);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', command, ...args],
  { stdio: 'inherit' },
);

child.on('exit', (code) => {
  process.exitCode = code || 0;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
