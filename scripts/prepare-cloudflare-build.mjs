import { rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Workers Builds checks out large LFS design files that the container never uses.
// Only clean the disposable Cloudflare checkout; local deployments keep all files.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const isCloudflareBuild = process.platform === 'linux'
  && process.env.WORKERS_CI === '1'
  && /^[a-f0-9-]{36}$/i.test(process.env.WORKERS_CI_BUILD_UUID ?? '')
  && root.startsWith('/opt/buildhome/');

if (isCloudflareBuild) {
  if (await realpath(root) !== root) throw new Error('Cleanup checkout must not be a symlink');
  for (const relative of ['models', 'exports', 'screenshots', 'tmp', 'design-concepts', '.git/lfs']) {
    if (relative === '.git/lfs') {
      const gitDirectory = path.join(root, '.git');
      const resolvedGit = await realpath(gitDirectory).catch(() => null);
      if (resolvedGit !== gitDirectory) continue;
    }
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error('Cleanup target outside checkout');
    // rm unlinks symlinks rather than following them into other directories.
    await rm(target, { recursive: true, force: true });
    console.log(`Removed deployment-unused checkout files: ${relative}`);
  }
} else {
  console.log('Keeping local files: cleanup runs only in Cloudflare Workers Builds.');
}
