import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const root = resolve('dist');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name),
      ),
    )
  ).flat();
}
const output = await files(root);
const pages = output.filter((file) => file.endsWith('.html'));
assert.equal(pages.length, 9, 'Landing page, seven docs pages, and 404 must build');
let links = 0;
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${file}: one page heading`);
  assert.ok(html.includes('id="main"'), `${file}: main landmark target`);
  assert.ok(
    !/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S[\s\S]*?<\/script>/.test(html),
    `${file}: scripts must work with the deployed CSP`,
  );
  assert.ok(
    !/\/Users\/|\.opensrc\/|executor\.sh/.test(html),
    `${file}: no local paths or competitor branding`,
  );
  for (const match of html.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|data:)/.test(href)) continue;
    const base = new URL(
      file.slice(root.length).replace(/index\.html$/, ''),
      'https://test.invalid',
    );
    const url = new URL(href, base);
    let target = join(root, decodeURIComponent(url.pathname));
    if (!extname(target)) target = join(target, 'index.html');
    assert.ok((await stat(target).catch(() => undefined))?.isFile(), `${file}: missing ${href}`);
    if (url.hash && target.endsWith('.html')) {
      const targetHtml = await readFile(target, 'utf8');
      assert.ok(
        targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
        `${file}: missing anchor ${href}`,
      );
    }
    links++;
  }
}
const index = JSON.parse(await readFile(join(root, 'search.json'), 'utf8'));
assert.equal(index.length, 7);
assert.ok(index.some((entry) => entry.text.includes('env://')));
assert.ok(
  index.every(
    (entry) => entry.title && entry.summary && entry.text && entry.url.startsWith('/docs/'),
  ),
);
assert.ok((await readFile(join(root, 'docs/config/index.html'), 'utf8')).includes('120000'));
assert.ok(
  (await readFile(join(root, 'docs/security/index.html'), 'utf8')).includes(
    'realaliarain@gmail.com',
  ),
);
console.log(
  `Verified ${pages.length} pages, ${links} local links/assets, search index, source-backed docs, and CSP-compatible scripts.`,
);
