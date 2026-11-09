// Copies .pack into Vortex's plugins folder, into the folder named by .pack/info.json's "id".
// The folder's contents are replaced so no stale file is left behind, and the folder itself is
// kept so a handle Vortex holds on it stays valid.
//
// Copies rather than links: Node resolves a junction to its target for module.filename, and
// Vortex decides whether to answer require('vortex-api') by checking that the filename is inside
// its plugins folder, so a linked extension would silently get the unproxied api.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deployedDir, PACK_DIR, readPackInfo } from './vortex-paths.mjs';

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

function main() {
    const info = readPackInfo();
    const target = deployedDir(info.id);

    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(target)) {
        rmSync(join(target, entry), { recursive: true, force: true });
    }
    cpSync(PACK_DIR, target, { recursive: true, force: true });

    console.log(`Deployed ${info.name} v${info.version} to: ${target}`);
}
