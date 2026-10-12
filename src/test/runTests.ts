import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { runTests } from '@vscode/test-electron';
import { createFixtureWorkspace } from './fixtures/createFixtureWorkspace';

async function main() {
    // Inherited when started from a process of VS Code itself; it would make the test instance run as plain Node
    delete process.env.ELECTRON_RUN_AS_NODE;

    // Windows: deep workspace paths push VS Code's bundled binaries past MAX_PATH
    const cachePath = process.platform === 'win32' ? path.join(os.tmpdir(), 'vortex-extension-helper-vscode-test') : path.resolve('.vscode-test');
    const profileArgs = ['--extensions-dir', path.join(cachePath, 'extensions'), '--user-data-dir', path.join(cachePath, 'user-data')];

    // The fixture projects must exist before VS Code opens them as the test workspace
    const fixture = createFixtureWorkspace();

    // file:// URIs keep paths containing spaces intact on Windows
    const extensionDevelopmentPath = pathToFileURL(path.resolve(__dirname, '../../')).href;
    const extensionTestsPath = pathToFileURL(path.resolve(__dirname, './suite/index')).href;

    try {
        await runTests({
            cachePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            // Without it the fixture opens in Restricted Mode, where tasks wait for a trust prompt
            launchArgs: [fixture.workspaceFile, '--disable-extensions', '--disable-workspace-trust', ...profileArgs],
            extensionTestsEnv: {
                VORTEX_HELPER_SCRATCH: fixture.scratchPath,
                VORTEX_HELPER_BUILD_TEST: process.env.VORTEX_HELPER_BUILD_TEST ?? '',
            },
        });
    } finally {
        fs.rmSync(fixture.rootPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
}

main().catch((err) => {
    console.error('Failed to run tests:', err);
    process.exit(1);
});
