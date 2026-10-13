import * as vscode from 'vscode';
import { CONSTANTS_PATH, PACKAGE_JSON_PATH, requiredFiles } from '../templates/registry';
import type { VortexProject } from '../types/project';
import { fileExists, readCurrentText, readTextIfExists } from './fileSystemUtils';
import { isRecord, parseLenientJson } from './jsonUtils';
import { PACKAGE_LOCK_PATH, type ProjectSnapshot } from './validation';

/** Reads what validation needs; open documents win over the files on disk */
export async function readProjectSnapshot(project: VortexProject): Promise<ProjectSnapshot> {
    const at = (relativePath: string) => vscode.Uri.joinPath(project.folder.uri, relativePath);

    const packageJsonText = await readCurrentText(at(PACKAGE_JSON_PATH)) ?? '';
    const manifest = parseLenientJson(packageJsonText);
    const gameart = isRecord(manifest) && typeof manifest.gameart === 'string' && manifest.gameart ? manifest.gameart : undefined;

    const [existingFiles, gameartExists, packageLockText, vortexApiManifestText, typeScriptManifestText, constantsText] = await Promise.all([
        existingRequiredFiles(at),
        gameart ? fileExists(at(gameart)) : Promise.resolve(false),
        readTextIfExists(at(PACKAGE_LOCK_PATH)),
        readTextIfExists(at('node_modules/vortex-api/package.json')),
        readTextIfExists(at('node_modules/typescript/package.json')),
        readCurrentText(at(CONSTANTS_PATH)),
    ]);

    const typeScriptManifest = typeScriptManifestText === undefined ? undefined : parseLenientJson(typeScriptManifestText);
    return {
        packageJsonText,
        existingFiles,
        gameartExists,
        packageLockText,
        vortexApiManifestText,
        installedTypeScriptVersion: isRecord(typeScriptManifest) && typeof typeScriptManifest.version === 'string' ? typeScriptManifest.version : undefined,
        constants: constantsText === undefined ? undefined : { path: CONSTANTS_PATH, text: constantsText },
    };
}

async function existingRequiredFiles(at: (relativePath: string) => vscode.Uri): Promise<Set<string>> {
    const files = requiredFiles();
    const exists = await Promise.all(files.map(file => fileExists(at(file.path))));
    return new Set(files.filter((_, index) => exists[index]).map(file => file.path));
}
