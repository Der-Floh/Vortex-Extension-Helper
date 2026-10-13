import * as path from 'path';
import { getNodeValue, parseTree, type Node, type ParseError } from 'jsonc-parser';
import {
    COMMAND_ADD_VORTEX_LIBRARY,
    COMMAND_CREATE_MISSING_FILES,
    COMMAND_INSTALL_DEPENDENCIES,
    DISPLAY_NAME_PREFIX,
    GAMEART_EXTENSION,
    PLACEHOLDER_EXECUTABLE,
    PLACEHOLDER_STEAM_APP_ID,
    VERSION_PATTERN,
    VORTEX_API_SOURCE,
} from '../constants';
import { PACKAGE_JSON_PATH, requiredFiles } from '../templates/registry';
import type { Finding, Severity } from '../types/project';
import { commandLabel } from './commandLabel';
import { describeParseError, isRecord, keyNodeAt, nodeAt, parseStrictJson } from './jsonUtils';
import { VORTEX_LIBRARIES } from './vortexLibraries';

export const PACKAGE_LOCK_PATH = 'package-lock.json';

/** The fields populate-pack.mjs reads; it fails the build when one is missing or empty */
const REQUIRED_FIELDS = ['name', 'displayName', 'author', 'version', 'description', 'gameart'];
const LINUX_ROLLUP_PACKAGE = '@rollup/rollup-linux-x64-gnu';
const NEXUS_VORTEX_API = /Nexus-Mods\/vortex-api(\.git)?(#.*)?$/i;
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const FIRST_UNSUPPORTED_TYPESCRIPT_MAJOR = 7;

/** Everything the rules read from a project, so validation needs no IO */
export interface ProjectSnapshot {
    readonly packageJsonText: string;
    /** The required files that exist, relative to the project folder */
    readonly existingFiles: ReadonlySet<string>;
    readonly gameartExists: boolean;
    readonly packageLockText?: string;
    /** node_modules/vortex-api/package.json */
    readonly vortexApiManifestText?: string;
    /** The version in node_modules/typescript/package.json */
    readonly installedTypeScriptVersion?: string;
    /** src/common/constants.ts */
    readonly constants?: { readonly path: string; readonly text: string };
}

interface RuleContext {
    readonly snapshot: ProjectSnapshot;
    readonly root: Node;
    readonly manifest: Record<string, unknown>;
}

type Anchor = Pick<Finding, 'offset' | 'length'>;

export function validateProject(snapshot: ProjectSnapshot): Finding[] {
    const { root, errors } = parseStrictJson(snapshot.packageJsonText);
    if (errors.length > 0 || root?.type !== 'object') {
        return [...syntaxFindings(root, errors), ...requiredFileFindings(snapshot, undefined)];
    }

    const context: RuleContext = { snapshot, root, manifest: getNodeValue(root) as Record<string, unknown> };
    return [
        ...requiredFieldFindings(context),
        ...displayNameFindings(context),
        ...versionFindings(context),
        ...gameartFindings(context),
        ...requiredFileFindings(snapshot, root),
        ...vortexApiFindings(context),
        ...bluebirdFindings(context),
        ...typescriptFindings(context),
        ...lockfileFindings(context),
        ...runtimeExternalFindings(context),
        ...placeholderFindings(snapshot),
    ];
}

function syntaxFindings(root: Node | undefined, errors: readonly ParseError[]): Finding[] {
    if (errors.length === 0) {
        return [packageJsonFinding('package-json-syntax', 'error', 'package.json must contain a JSON object.', anchorOf(root))];
    }
    return errors.map(error => packageJsonFinding(
        'package-json-syntax', 'error',
        `package.json is not valid JSON (${describeParseError(error)}). npm can't read comments or trailing commas.`,
        { offset: error.offset, length: Math.max(error.length, 1) }
    ));
}

function requiredFieldFindings({ root, manifest }: RuleContext): Finding[] {
    return REQUIRED_FIELDS.filter(field => !manifest[field]).map(field => packageJsonFinding(
        'required-field', 'error',
        field === 'gameart'
            ? 'package.json has no "gameart". The build copies that file into .pack as the game\'s logo.'
            : `package.json has no "${field}". The build generates .pack/info.json from it.`,
        anchorOf(nodeAt(root, [field]) ?? root)
    ));
}

function displayNameFindings({ root, manifest }: RuleContext): Finding[] {
    const displayName = manifest.displayName;
    if (typeof displayName !== 'string' || !displayName || displayName.startsWith(DISPLAY_NAME_PREFIX)) {
        return [];
    }
    return [packageJsonFinding(
        'display-name-prefix', 'warning',
        `Vortex game extensions are named "${DISPLAY_NAME_PREFIX}<game>", for example "${DISPLAY_NAME_PREFIX}${displayName}".`,
        anchorOf(nodeAt(root, ['displayName']))
    )];
}

function versionFindings({ root, manifest }: RuleContext): Finding[] {
    const version = manifest.version;
    if (typeof version !== 'string' || !version || VERSION_PATTERN.test(version)) {
        return [];
    }
    return [packageJsonFinding(
        'version-format', 'warning',
        `"${version}" is not a release version. Use one like 1.0.0 or 1.0.0-beta.1.`,
        anchorOf(nodeAt(root, ['version']))
    )];
}

function gameartFindings({ snapshot, root, manifest }: RuleContext): Finding[] {
    const gameart = manifest.gameart;
    if (typeof gameart !== 'string' || !gameart) {
        return [];
    }
    const anchor = anchorOf(nodeAt(root, ['gameart']));
    if (path.posix.extname(gameart).toLowerCase() !== GAMEART_EXTENSION) {
        return [packageJsonFinding('gameart-extension', 'error', 'The game art must be a .jpg file, because the extension registers gameart.jpg as its logo.', anchor)];
    }
    if (!snapshot.gameartExists) {
        return [packageJsonFinding('gameart-missing', 'error', `"${gameart}" doesn't exist. Run ${commandLabel(COMMAND_CREATE_MISSING_FILES)} to add a placeholder.`, anchor)];
    }
    return [];
}

function requiredFileFindings(snapshot: ProjectSnapshot, root: Node | undefined): Finding[] {
    return requiredFiles()
        .filter(file => !snapshot.existingFiles.has(file.path))
        .map(file => packageJsonFinding(
            'required-file', file.severity,
            `${file.path} is missing. Run ${commandLabel(COMMAND_CREATE_MISSING_FILES)} to restore it.`,
            anchorOf(root)
        ));
}

function vortexApiFindings({ snapshot, root, manifest }: RuleContext): Finding[] {
    const source = dependencySpec(manifest, 'vortex-api');
    const anchor = anchorOf(nodeAt(root, ['devDependencies', 'vortex-api']) ?? root);
    const findings: Finding[] = [];
    if (source !== undefined && !NEXUS_VORTEX_API.test(source)) {
        findings.push(packageJsonFinding('vortex-api-source', 'warning', `vortex-api should come from GitHub: "${VORTEX_API_SOURCE}". The npm package of that name is unrelated.`, anchor));
    }
    if (snapshot.vortexApiManifestText === undefined) {
        findings.push(packageJsonFinding('vortex-api-not-installed', 'information', `vortex-api is not installed. Run ${commandLabel(COMMAND_INSTALL_DEPENDENCIES)}.`, anchor));
    }
    return findings;
}

function bluebirdFindings({ snapshot, root, manifest }: RuleContext): Finding[] {
    const vortexApi = snapshot.vortexApiManifestText === undefined ? undefined : parseObject(snapshot.vortexApiManifestText);
    const peer = isRecord(vortexApi?.peerDependencies) ? vortexApi.peerDependencies['@types/bluebird'] : undefined;
    const declared = dependencySpec(manifest, '@types/bluebird');
    if (typeof peer !== 'string' || !EXACT_VERSION.test(peer) || declared === undefined || declared === peer) {
        return [];
    }
    return [packageJsonFinding(
        'bluebird-peer', 'error',
        `@types/bluebird must be "${peer}", the version the installed vortex-api requires as a peer. npm refuses any other version (ERESOLVE).`,
        anchorOf(dependencyNode(root, '@types/bluebird'))
    )];
}

function typescriptFindings({ snapshot, root, manifest }: RuleContext): Finding[] {
    const declared = dependencySpec(manifest, 'typescript');
    if (declared === undefined) {
        return [packageJsonFinding('typescript-major', 'error', 'TypeScript projects need typescript in devDependencies for @rollup/plugin-typescript. Add "typescript": "^6.0.3".', anchorOf(nodeAt(root, ['devDependencies']) ?? root))];
    }
    const anchor = anchorOf(dependencyNode(root, 'typescript'));
    const declaredMajor = leadingMajor(declared);
    if (declaredMajor !== undefined && declaredMajor >= FIRST_UNSUPPORTED_TYPESCRIPT_MAJOR) {
        return [packageJsonFinding('typescript-major', 'error', `TypeScript ${declaredMajor} has no compiler API, which @rollup/plugin-typescript needs. Use "^6.0.3".`, anchor)];
    }
    const installedMajor = snapshot.installedTypeScriptVersion === undefined ? undefined : leadingMajor(snapshot.installedTypeScriptVersion);
    if (installedMajor !== undefined && installedMajor >= FIRST_UNSUPPORTED_TYPESCRIPT_MAJOR) {
        return [packageJsonFinding('typescript-major', 'error', `TypeScript ${snapshot.installedTypeScriptVersion} is installed, which has no compiler API for @rollup/plugin-typescript. Run ${commandLabel(COMMAND_INSTALL_DEPENDENCIES)}.`, anchor)];
    }
    return [];
}

function lockfileFindings({ snapshot, root, manifest }: RuleContext): Finding[] {
    if (snapshot.packageLockText === undefined) {
        return [packageJsonFinding('lockfile-missing', 'information', `There is no package-lock.json yet. Run ${commandLabel(COMMAND_INSTALL_DEPENDENCIES)} to create it; npm ci needs it.`, anchorOf(root))];
    }
    const lockRoot = parseTree(snapshot.packageLockText, [], { allowTrailingComma: true });
    const lock = lockRoot ? getNodeValue(lockRoot) as unknown : undefined;
    if (!isRecord(lock)) {
        return [];
    }

    const findings: Finding[] = [];
    const packages = isRecord(lock.packages) ? lock.packages : undefined;
    const dependencies = isRecord(lock.dependencies) ? lock.dependencies : undefined;
    const hasRollup = packages ? 'node_modules/rollup' in packages : dependencies ? 'rollup' in dependencies : false;
    const hasLinuxRollup = packages ? `node_modules/${LINUX_ROLLUP_PACKAGE}` in packages : dependencies ? LINUX_ROLLUP_PACKAGE in dependencies : false;
    if (hasRollup && !hasLinuxRollup) {
        findings.push(lockFinding(
            'lockfile-rollup-linux',
            `package-lock.json has no ${LINUX_ROLLUP_PACKAGE}, so npm ci fails on Linux, for example in GitHub Actions. Delete node_modules and package-lock.json, then run ${commandLabel(COMMAND_INSTALL_DEPENDENCIES)}.`,
            anchorOf(lockRoot)
        ));
    }

    const rootPackage = packages && isRecord(packages['']) ? packages[''] : undefined;
    const lockVersion = typeof rootPackage?.version === 'string' ? rootPackage.version : lock.version;
    const versionNode = typeof rootPackage?.version === 'string' ? nodeAt(lockRoot, ['packages', '', 'version']) : nodeAt(lockRoot, ['version']);
    if (typeof lockVersion === 'string' && typeof manifest.version === 'string' && manifest.version && lockVersion !== manifest.version) {
        findings.push(lockFinding('lockfile-version', `package-lock.json still has version ${lockVersion}. Run npm install to update it to ${manifest.version}.`, anchorOf(versionNode ?? lockRoot)));
    }
    return findings;
}

function runtimeExternalFindings({ root, manifest }: RuleContext): Finding[] {
    const externals = isRecord(manifest.vortex) && Array.isArray(manifest.vortex.externals) ? manifest.vortex.externals : [];
    return VORTEX_LIBRARIES
        .filter(library => dependencySpec(manifest, library.name) !== undefined && !externals.includes(library.name))
        .map(library => packageJsonFinding(
            'runtime-external', 'information',
            `${library.name} is provided by Vortex at runtime, but isn't listed in "vortex": { "externals" }, so rollup reports it as an unresolved import. Run ${commandLabel(COMMAND_ADD_VORTEX_LIBRARY)} or add it there.`,
            anchorOf(dependencyKeyNode(root, library.name))
        ));
}

function placeholderFindings(snapshot: ProjectSnapshot): Finding[] {
    const constants = snapshot.constants;
    if (!constants) {
        return [];
    }
    const placeholders = [
        { token: PLACEHOLDER_STEAM_APP_ID, message: `Replace the placeholder ${PLACEHOLDER_STEAM_APP_ID} with the game's Steam app id.` },
        { token: PLACEHOLDER_EXECUTABLE, message: `Replace the placeholder ${PLACEHOLDER_EXECUTABLE} with the game's executable, relative to the game folder.` },
    ];
    return placeholders.flatMap(({ token, message }) =>
        [...constants.text.matchAll(new RegExp(`(['"\`])${escapeRegExp(token)}\\1`, 'g'))].map(match => ({
            rule: 'placeholder',
            severity: 'information' as const,
            message,
            file: constants.path,
            offset: match.index + 1,
            length: token.length,
        }))
    );
}

function packageJsonFinding(rule: string, severity: Severity, message: string, anchor: Anchor): Finding {
    return { rule, severity, message, file: PACKAGE_JSON_PATH, ...anchor };
}

function lockFinding(rule: string, message: string, anchor: Anchor): Finding {
    return { rule, severity: 'information', message, file: PACKAGE_LOCK_PATH, ...anchor };
}

/** Anchors on a node; objects and arrays only on their opening bracket */
function anchorOf(node: Node | undefined): Anchor {
    if (!node) {
        return { offset: 0, length: 1 };
    }
    return { offset: node.offset, length: node.type === 'object' || node.type === 'array' ? 1 : node.length };
}

function dependencySpec(manifest: Record<string, unknown>, name: string): string | undefined {
    for (const field of ['devDependencies', 'dependencies']) {
        const dependencies = manifest[field];
        if (isRecord(dependencies) && typeof dependencies[name] === 'string') {
            return dependencies[name];
        }
    }
    return undefined;
}

function dependencyNode(root: Node, name: string): Node | undefined {
    return nodeAt(root, ['devDependencies', name]) ?? nodeAt(root, ['dependencies', name]);
}

function dependencyKeyNode(root: Node, name: string): Node | undefined {
    return keyNodeAt(root, ['devDependencies', name]) ?? keyNodeAt(root, ['dependencies', name]);
}

function leadingMajor(range: string): number | undefined {
    const match = /^\s*(?:[~^]|>=?|=)?\s*v?(\d+)/.exec(range);
    return match ? Number(match[1]) : undefined;
}

function parseObject(text: string): Record<string, unknown> | undefined {
    const root = parseTree(text, [], { allowTrailingComma: true });
    const value: unknown = root ? getNodeValue(root) : undefined;
    return isRecord(value) ? value : undefined;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
