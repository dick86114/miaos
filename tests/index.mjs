import { readdir } from 'node:fs/promises';

const testDir = new URL('.', import.meta.url);
const entries = await readdir(testDir);

for (const entry of entries.filter((name) => /\.test\.(mjs|cjs)$/.test(name)).sort()) {
  await import(new URL(entry, testDir));
}
