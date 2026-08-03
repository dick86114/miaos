import { readdir } from 'node:fs/promises';

const testDir = new URL('.', import.meta.url);
const entries = await readdir(testDir);

for (const entry of entries.filter((name) => name.endsWith('.test.mjs')).sort()) {
  await import(new URL(entry, testDir));
}
