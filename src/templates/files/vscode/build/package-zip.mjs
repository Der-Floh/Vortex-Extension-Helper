import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PACK_DIR = join(ROOT, '.pack');
const DIST_DIR = join(ROOT, 'dist');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (!existsSync(PACK_DIR)) {
    throw new Error(".pack/ directory not found. Run 'npm run build' first.");
}

const files = Object.fromEntries(
    readdirSync(PACK_DIR, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => [entry.name, readFileSync(join(PACK_DIR, entry.name))]),
);

const zipName = `${pkg.name}-${pkg.version}.zip`;
mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(join(DIST_DIR, zipName), zipSync(files, { level: 9 }));
console.log(`Packaged: dist/${zipName}`);
