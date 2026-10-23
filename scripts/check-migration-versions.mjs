import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(root, '../supabase/migrations');
const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const versions = files.map((file) => {
  const match = /^(\d+)_.*\.sql$/.exec(file);
  assert.ok(match, `Migration filename must start with a numeric version and underscore: ${file}`);
  return { file, version: match[1] };
});

assert.equal(new Set(versions.map(({ version }) => version)).size, versions.length, 'Migration versions must be unique');
for (const shortVersion of versions.filter(({ version }) => /^\d{8}$/.test(version))) {
  for (const longVersion of versions.filter(({ version }) => /^\d{14}$/.test(version))) {
    assert.ok(
      !longVersion.version.startsWith(shortVersion.version),
      `Avoid an 8-digit version prefix collision: ${shortVersion.file} vs ${longVersion.file}`,
    );
  }
}
console.log(`PASS Supabase migration versions are unique and avoid 8/14-digit prefix collisions (${files.length} files)`);
