import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PACK_DIR = join(ROOT, '.pack');
const GAMEART_NAME = 'gameart.jpg';
const INFO_FIELDS = ['name', 'displayName', 'author', 'version', 'description', 'gameId'];

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (!existsSync(join(PACK_DIR, 'index.js'))) {
    throw new Error(".pack/index.js not found. Run 'npm run build' instead.");
}

copyGameart();
writeInfo();
console.log('.pack populated successfully.');

function copyGameart() {
    if (!pkg.gameart) {
        throw new Error("package.json has no 'gameart' path.");
    }
    const source = join(ROOT, pkg.gameart);
    if (!existsSync(source)) {
        throw new Error(`Gameart '${pkg.gameart}' set in package.json not found.`);
    }
    if (extname(source).toLowerCase() !== extname(GAMEART_NAME)) {
        throw new Error(`Gameart '${pkg.gameart}' must be a .jpg, since the extension registers ${GAMEART_NAME} as its logo.`);
    }
    copyFileSync(source, join(PACK_DIR, GAMEART_NAME));
    console.log(`Gameart: ${pkg.gameart}`);
}

function writeInfo() {
    for (const field of INFO_FIELDS) {
        if (!pkg[field]) {
            throw new Error(`package.json has no '${field}', which info.json is generated from.`);
        }
    }
    if (!Number.isInteger(pkg.gameId)) {
        throw new Error(`package.json has 'gameId' set to '${pkg.gameId}'; info.json needs the game's numerical Nexus Mods id.`);
    }
    const info = {
        id: pkg.name,
        name: pkg.displayName,
        author: pkg.author,
        version: pkg.version,
        description: pkg.description,
        gameId: pkg.gameId,
    };
    writeFileSync(join(PACK_DIR, 'info.json'), `${JSON.stringify(info, null, 4)}\n`);
    console.log(`info.json: generated from package.json (v${pkg.version})`);
}
