import * as assert from 'assert';
import { renderProject, requiredFiles } from '../../templates/registry';
import type { Finding } from '../../types/project';
import { validateProject, type ProjectSnapshot } from '../../utils/validation';
import { TS_FIXTURE_VALUES } from '../fixtures/createFixtureWorkspace';

const WINAPI_BINDINGS = 'git+https://github.com/Nexus-Mods/node-winapi-bindings.git';
const VORTEX_API_MANIFEST = JSON.stringify({ name: 'vortex-api', version: '2.3.0-beta.1', peerDependencies: { '@types/bluebird': '3.5.20' } });

function generatedPackageJson(): Record<string, unknown> {
    const output = renderProject(TS_FIXTURE_VALUES).find(candidate => candidate.path === 'package.json');
    return JSON.parse(output?.content as string);
}

function lockFor(manifest: Record<string, unknown>, extraPackages: Record<string, unknown> = { 'node_modules/@rollup/rollup-linux-x64-gnu': {} }): string {
    return JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { '': { version: manifest.version }, 'node_modules/rollup': {}, ...extraPackages } }, null, 2);
}

/** A healthy, installed project; each test breaks one thing */
function snapshot(overrides: Partial<ProjectSnapshot> & { manifest?: Record<string, unknown> } = {}): ProjectSnapshot {
    const manifest = overrides.manifest ?? generatedPackageJson();
    return {
        packageJsonText: JSON.stringify(manifest, null, 4),
        existingFiles: new Set(requiredFiles().map(file => file.path)),
        gameartExists: true,
        packageLockText: lockFor(manifest),
        vortexApiManifestText: VORTEX_API_MANIFEST,
        installedTypeScriptVersion: '6.0.3',
        constants: { path: 'src/common/constants.ts', text: 'export const GAME = { steamAppId: \'123\', exe: \'Game.exe\' };' },
        ...overrides,
    };
}

function rules(findings: readonly Finding[]): string[] {
    return findings.map(finding => finding.rule);
}

function withManifest(change: (manifest: Record<string, unknown>) => void): ProjectSnapshot {
    const manifest = generatedPackageJson();
    change(manifest);
    return snapshot({ manifest, packageLockText: lockFor(manifest) });
}

function withField(field: string, value: unknown): ProjectSnapshot {
    return withManifest(manifest => {
        manifest[field] = value;
    });
}

function withDependency(name: string, spec: string | undefined): ProjectSnapshot {
    return withManifest(manifest => {
        const devDependencies = manifest.devDependencies as Record<string, string>;
        if (spec === undefined) {
            delete devDependencies[name];
        } else {
            devDependencies[name] = spec;
        }
    });
}

function anchoredText(text: string | undefined, finding: Finding): string | undefined {
    return text?.slice(finding.offset, (finding.offset ?? 0) + (finding.length ?? 0));
}

suite('Validation', () => {
    test('a generated, installed project has no findings', () => {
        assert.deepStrictEqual(validateProject(snapshot()), []);
    });

    test('syntax errors are reported at their offset, and stop the package.json rules', () => {
        const text = '{\n    "name": "x",\n}';
        const findings = validateProject(snapshot({ packageJsonText: text }));
        assert.ok(findings.length > 0 && findings.every(finding => finding.rule === 'package-json-syntax'));
        assert.ok(findings.some(finding => finding.offset === text.indexOf('}')));
    });

    test('a package.json that is no object is a syntax error', () => {
        assert.deepStrictEqual(rules(validateProject(snapshot({ packageJsonText: '[]' }))), ['package-json-syntax']);
    });

    test('missing or empty fields are errors at the value, or at the root', () => {
        const findings = validateProject(withManifest(manifest => {
            manifest.displayName = '';
            delete manifest.author;
        }));
        assert.deepStrictEqual(rules(findings), ['required-field', 'required-field']);
    });

    test('a required-field finding points at the empty value', () => {
        const target = withField('displayName', '');
        const [finding] = validateProject(target);
        assert.strictEqual(anchoredText(target.packageJsonText, finding), '""');
    });

    test('displayName should start with "Game: "', () => {
        const target = withField('displayName', 'TS Game');
        const [finding] = validateProject(target);
        assert.strictEqual(finding.rule, 'display-name-prefix');
        assert.strictEqual(finding.severity, 'warning');
        assert.strictEqual(anchoredText(target.packageJsonText, finding), '"TS Game"');
    });

    test('versions the release workflow accepts pass, others warn', () => {
        for (const version of ['1.0', '1.0.0.0', '1.0.0-beta.1']) {
            assert.deepStrictEqual(rules(validateProject(withField('version', version))), [], version);
        }
        for (const version of ['1', 'v1.0.0', '1.0.0+b', '1.0.0.0.0']) {
            assert.deepStrictEqual(rules(validateProject(withField('version', version))), ['version-format'], version);
        }
    });

    test('game art must be a .jpg, case-insensitively, and exist', () => {
        assert.deepStrictEqual(rules(validateProject(withField('gameart', 'assets/Gameart.JPG'))), []);
        assert.deepStrictEqual(rules(validateProject(withField('gameart', 'assets/gameart.jpeg'))), ['gameart-extension']);
        assert.deepStrictEqual(rules(validateProject(withField('gameart', 'assets/gameart.png'))), ['gameart-extension']);
        assert.deepStrictEqual(rules(validateProject(snapshot({ gameartExists: false }))), ['gameart-missing']);
    });

    test('missing generated files are reported', () => {
        const findings = validateProject(snapshot({ existingFiles: new Set(['rollup.config.mjs']) }));
        assert.deepStrictEqual(findings.map(finding => finding.message.split(' ')[0]).sort(), ['.vscode/build/package-zip.mjs', '.vscode/build/populate-pack.mjs', 'src/index.ts', 'tsconfig.json']);
    });

    test('@types/bluebird must equal the peer of the installed vortex-api', () => {
        const mismatch = withDependency('@types/bluebird', '^3.5.42');
        assert.deepStrictEqual(rules(validateProject(mismatch)), ['bluebird-peer']);
        assert.deepStrictEqual(rules(validateProject({ ...mismatch, vortexApiManifestText: undefined })), ['vortex-api-not-installed']);
        assert.deepStrictEqual(rules(validateProject(withDependency('@types/bluebird', undefined))), []);
    });

    test('TypeScript 7 has no compiler API, so TS projects need TypeScript 6', () => {
        assert.deepStrictEqual(rules(validateProject(withDependency('typescript', '^7.0.0'))), ['typescript-major']);
        assert.deepStrictEqual(rules(validateProject(withDependency('typescript', undefined))), ['typescript-major']);
        assert.deepStrictEqual(rules(validateProject(snapshot({ installedTypeScriptVersion: '7.0.2' }))), ['typescript-major']);
    });

    test('vortex-api from npm is the wrong package', () => {
        assert.deepStrictEqual(rules(validateProject(withDependency('vortex-api', '^2.2.0'))), ['vortex-api-source']);
        assert.deepStrictEqual(rules(validateProject(withDependency('vortex-api', 'github:Nexus-Mods/vortex-api#6b9040d'))), []);
    });

    test('lockfile notes: missing, without the Linux rollup binary, and an old version', () => {
        assert.deepStrictEqual(rules(validateProject(snapshot({ packageLockText: undefined }))), ['lockfile-missing']);
        const manifest = generatedPackageJson();
        const withoutLinux = validateProject(snapshot({ packageLockText: lockFor(manifest, {}) }));
        assert.deepStrictEqual(withoutLinux.map(finding => [finding.rule, finding.file, finding.severity]), [['lockfile-rollup-linux', 'package-lock.json', 'information']]);
        const v1 = JSON.stringify({ version: '1.0.0', lockfileVersion: 1, dependencies: { rollup: {} } });
        assert.deepStrictEqual(rules(validateProject(snapshot({ packageLockText: v1 }))), ['lockfile-rollup-linux']);
        const stale = snapshot({ packageLockText: lockFor({ ...manifest, version: '0.9.0' }) });
        const [finding] = validateProject(stale);
        assert.strictEqual(finding.rule, 'lockfile-version');
        assert.strictEqual(anchoredText(stale.packageLockText, finding), '"0.9.0"');
    });

    test('a Vortex library missing from vortex.externals is noted at its dependency', () => {
        const target = withDependency('winapi-bindings', WINAPI_BINDINGS);
        const [finding] = validateProject(target);
        assert.strictEqual(finding.rule, 'runtime-external');
        assert.strictEqual(anchoredText(target.packageJsonText, finding), '"winapi-bindings"');
        assert.deepStrictEqual(rules(validateProject(withManifest(manifest => {
            (manifest.devDependencies as Record<string, string>)['winapi-bindings'] = WINAPI_BINDINGS;
            manifest.vortex = { externals: ['winapi-bindings'] };
        }))), []);
    });

    test('placeholders in the constants are noted at each occurrence', () => {
        const text = 'steamAppId: \'STEAM_APP_ID\',\nexe: \'GAME_EXECUTABLE.exe\',\nrequiredFiles: [\'GAME_EXECUTABLE.exe\'],';
        const findings = validateProject(snapshot({ constants: { path: 'src/common/constants.ts', text } }));
        assert.deepStrictEqual(findings.map(finding => [finding.rule, finding.file, anchoredText(text, finding)]), [
            ['placeholder', 'src/common/constants.ts', 'STEAM_APP_ID'],
            ['placeholder', 'src/common/constants.ts', 'GAME_EXECUTABLE.exe'],
            ['placeholder', 'src/common/constants.ts', 'GAME_EXECUTABLE.exe'],
        ]);
    });
});
