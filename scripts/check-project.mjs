import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

for (const path of ['next.config.ts', 'vercel.json', 'netlify.toml']) {
  await access(path);
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const dependencies = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

for (const name of ['@libsql/client', 'drizzle-orm', 'drizzle-kit']) {
  assert.equal(dependencies[name], undefined, `${name} must not be installed`);
  assert.equal(lock.packages[`node_modules/${name}`], undefined, `${name} must not be locked`);
}

assert.ok(pkg.dependencies.mongodb);
assert.ok(lock.packages['node_modules/mongodb']);
assert.equal(pkg.scripts.build, 'next build --webpack');
assert.equal(pkg.scripts.start, 'node scripts/run-next.mjs start');
assert.equal(pkg.scripts.dev, 'node scripts/run-next.mjs dev');
assert.equal(
  pkg.scripts.test,
  'node --no-warnings tests/mongodb-schema.mjs && node scripts/check-project.mjs',
);
assert.equal(pkg.scripts['test:mongo'], 'node tests/mongodb-schema.mjs');
assert.ok(pkg.scripts['admin:setup']);
assert.ok(pkg.scripts['admin:check']);

for (const name of Object.keys(pkg.scripts)) {
  assert.doesNotMatch(name, /^(db:|.*migrat.*|.*portable.*)$/i);
}

for (const path of [
  'db',
  'drizzle',
  'drizzle.config.ts',
  'scripts/prebuild.mjs',
  'scripts/migrate-portable.mjs',
  'scripts/database-info.mjs',
]) {
  await assert.rejects(access(path), { code: 'ENOENT' }, `${path} must be removed`);
}

const launcher = await readFile('scripts/run-next.mjs', 'utf8');
assert.match(launcher, /readLocalEnv/);
assert.doesNotMatch(launcher, /TURSO|libsql|drizzle|migrat|sqlite/i);

console.log('PASS: MongoDB-only scripts, dependencies, and Vercel build/start setup.');
