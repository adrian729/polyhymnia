#!/usr/bin/env node
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCHEMA_DIR = path.join(PACKAGE_ROOT, 'schema');
const EXAMPLES_DIR = path.join(SCHEMA_DIR, 'examples');
const EXAMPLES_PATH_PREFIX = 'docs/static/examples/json/';
const SCHEMA_PATH = 'docs/mnx-schema.json';

const commit = process.argv[2];
if (!commit) {
  console.error('Usage: pnpm mnx:update <commit-sha>');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  return res.text();
}

async function getCommitDate(sha) {
  const data = await fetchJson(`https://api.github.com/repos/w3c-cg/mnx/commits/${sha}`);
  return data.commit.committer.date;
}

async function listExamplePaths(sha) {
  const data = await fetchJson(
    `https://api.github.com/repos/w3c-cg/mnx/git/trees/${sha}?recursive=1`,
  );
  return data.tree
    .filter((item) => item.type === 'blob' && item.path.startsWith(EXAMPLES_PATH_PREFIX))
    .map((item) => item.path);
}

function rawUrl(sha, repoPath) {
  return `https://raw.githubusercontent.com/w3c-cg/mnx/${sha}/${repoPath}`;
}

async function main() {
  console.log(`Fetching MNX at commit ${commit}...`);
  const commitDate = await getCommitDate(commit);

  const schemaText = await fetchText(rawUrl(commit, SCHEMA_PATH));
  const schema = JSON.parse(schemaText);
  await mkdir(SCHEMA_DIR, { recursive: true });
  await writeFile(path.join(SCHEMA_DIR, 'mnx-schema.json'), schemaText);

  const examplePaths = await listExamplePaths(commit);
  if (examplePaths.length === 0) {
    throw new Error(`No example files found under ${EXAMPLES_PATH_PREFIX} at ${commit}`);
  }

  await rm(EXAMPLES_DIR, { recursive: true, force: true });
  await mkdir(EXAMPLES_DIR, { recursive: true });
  let docVersion;
  for (const repoPath of examplePaths) {
    const slug = path.basename(repoPath);
    const text = await fetchText(rawUrl(commit, repoPath));
    await writeFile(path.join(EXAMPLES_DIR, slug), text);
    const version = JSON.parse(text)?.mnx?.version;
    if (docVersion === undefined) docVersion = version;
  }
  console.log(`Vendored ${examplePaths.length} example documents.`);
  await writeFile(
    path.join(SCHEMA_DIR, 'SOURCE'),
    [
      'Vendored from: https://github.com/w3c-cg/mnx',
      `Commit: ${commit}`,
      `Commit date: ${commitDate}`,
      `Schema $id: ${schema.$id}`,
      `Document mnx.version (runtime-checked): ${docVersion}`,
      '',
      'Files:',
      '  schema/mnx-schema.json           <- docs/mnx-schema.json',
      `  schema/examples/<slug>.json      <- docs/static/examples/json/<slug>.json (${examplePaths.length} files)`,
      '',
      'Update with: pnpm mnx:update <commit>',
      '',
    ].join('\n'),
  );

  console.log('Regenerating src/mnx/types.ts...');
  const result = spawnSync('node', ['scripts/gen-mnx-types.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('gen:mnx-types failed');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

