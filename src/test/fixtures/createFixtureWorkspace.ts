import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderProject } from '../../templates/registry';
import type { GeneratedOutput, ProjectValues } from '../../types/project';

export interface FixtureWorkspace {
    rootPath: string;
    workspaceFile: string;
    /** A folder outside the workspace for tests that write projects */
    scratchPath: string;
}

export const FIXTURE_FOLDERS = {
    typescript: 'ts-project',
    javascript: 'js-project',
    legacy: 'legacy-project',
    plain: 'plain-folder',
} as const;

export const TS_FIXTURE_VALUES: ProjectValues = {
    language: 'typescript',
    shortName: 'tsgame',
    gameId: 'tsgame',
    gameName: 'TS Game',
    author: 'Vortex Extension Helper Tests',
    steamAppId: '123456',
    executable: 'TS Game.exe',
};

export const JS_FIXTURE_VALUES: ProjectValues = {
    ...TS_FIXTURE_VALUES,
    language: 'javascript',
    shortName: 'jsgame',
    gameId: 'jsgame',
    gameName: 'JS Game',
};

/**
 * Creates a multi-root workspace with:
 * - ts-project and js-project: generated game extensions;
 * - legacy-project: vortex-api with a root info.json, the old layout;
 * - plain-folder: a Node project without vortex-api.
 */
export function createFixtureWorkspace(): FixtureWorkspace {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-extension-helper-'));
    writeOutputs(path.join(rootPath, FIXTURE_FOLDERS.typescript), renderProject(TS_FIXTURE_VALUES));
    writeOutputs(path.join(rootPath, FIXTURE_FOLDERS.javascript), renderProject(JS_FIXTURE_VALUES));
    writeOutputs(path.join(rootPath, FIXTURE_FOLDERS.legacy), [
        { path: 'package.json', content: JSON.stringify({ name: 'legacy-support', devDependencies: { 'vortex-api': 'git+https://github.com/Nexus-Mods/vortex-api.git' } }, null, 4) },
        { path: 'info.json', content: JSON.stringify({ name: 'Game: Legacy', author: 'Tests', version: '1.0.0', description: 'Old layout' }, null, 4) },
        { path: 'src/index.ts', content: 'export default function main() { return true; }\n' },
    ]);
    writeOutputs(path.join(rootPath, FIXTURE_FOLDERS.plain), [
        { path: 'package.json', content: JSON.stringify({ name: 'plain', devDependencies: { typescript: '^6.0.3' } }, null, 4) },
        { path: 'index.ts', content: 'export const value = 1;\n' },
    ]);

    const scratchPath = path.join(rootPath, 'scratch');
    fs.mkdirSync(scratchPath);
    const workspaceFile = path.join(rootPath, 'fixture.code-workspace');
    fs.writeFileSync(workspaceFile, JSON.stringify({ folders: Object.values(FIXTURE_FOLDERS).map(folder => ({ path: folder })) }, null, 4));
    return { rootPath, workspaceFile, scratchPath };
}

export function writeOutputs(folder: string, outputs: readonly GeneratedOutput[]): void {
    for (const output of outputs) {
        const target = path.join(folder, output.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, output.content);
    }
}
