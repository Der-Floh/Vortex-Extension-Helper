import * as assert from 'assert';
import { exec } from 'child_process';
import * as fs from 'fs';
import Module from 'module';
import * as path from 'path';
import { promisify } from 'util';
import { DISCOVERED_CATALOGUE } from '../../templates/addons/discoveredCatalogue';
import type { AddonChoices } from '../../templates/addons/resolveAddons';
import { renderProject } from '../../templates/registry';
import type { ProjectValues } from '../../types/project';
import { addonOutcomes, outcomeKey } from '../fixtures/addonOutcomes';
import { writeOutputs } from '../fixtures/createFixtureWorkspace';

const runShell = promisify(exec);

// Inside the repository, so the generated projects find vortex-api in its node_modules
const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUTCOMES_FOLDER = path.join(REPO_ROOT, 'out', 'test', 'outcomes');
const EMIT_FOLDER = path.join(OUTCOMES_FOLDER, 'js');
const TSC = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const COMPILE_TIMEOUT_MS = 300_000;

/** Every outcome of the wizard, in numbered folders so no path gets long */
const OUTCOMES = addonOutcomes(DISCOVERED_CATALOGUE);
const FOLDER_OF = new Map(OUTCOMES.map((outcome, index) => [outcomeKey(outcome.choices), String(index)]));

const MONO = { unityBuild: 'unitymono' };
const IL2CPP = { unityBuild: 'unityil2cpp' };
const SELECTIONS = {
    plain: { addons: [], options: {} },
    gml: { addons: ['gml'], options: {} },
    melonLoader: { addons: ['melonloader'], options: {} },
    bepInExMono: { addons: ['bepinex'], options: MONO },
    bepInExIl2cpp: { addons: ['bepinex'], options: IL2CPP },
    bothMono: { addons: ['melonloader', 'bepinex'], options: MONO },
    bothIl2cpp: { addons: ['melonloader', 'bepinex'], options: IL2CPP },
} satisfies Record<string, AddonChoices>;

const GAME_ID = 'awkward';
const GAME_FOLDER = path.join(path.sep, 'games', 'awkward');
const EXE_FOLDER = 'Game';
const EXECUTABLE = `${EXE_FOLDER}/Game.exe`;
const AWKWARD_VALUES: ProjectValues = {
    shortName: GAME_ID,
    gameId: GAME_ID,
    gameName: 'Baldur\'s */ Gate',
    nexusGameId: 3474,
    author: 'Tests',
    steamAppId: '1086940',
    executable: EXECUTABLE,
};

interface Instruction {
    readonly type: string;
    readonly source?: string;
    readonly destination?: string;
    readonly key?: string;
    readonly value?: unknown;
}

interface Installer {
    readonly id: string;
    readonly priority: number;
    test(files: string[], gameId: string): PromiseLike<{ supported: boolean }>;
    install?(files: string[], destination: string, gameId: string, progress: () => void): PromiseLike<{ instructions: Instruction[] }>;
}

interface RegisteredGame {
    queryModPath(): string;
    setup(discovery: { path: string }): PromiseLike<void>;
}

type StartHook = (call: { executable: string; args: string[]; options: { cwd?: string } }) => PromiseLike<{ args: string[] }>;

/** What the mocked Vortex knows, and what the extension told it */
function newWorld() {
    return {
        /** Absolute path to modification time */
        files: new Map<string, number>(),
        mods: {} as Record<string, unknown>,
        notifications: [] as string[],
        dismissed: [] as string[],
        removed: [] as string[],
        bepInExGames: [] as Record<string, unknown>[],
        bepInExSupport: true,
    };
}

let world = newWorld();

const missing = (file: string) => Object.assign(new Error(`ENOENT ${file}`), { code: 'ENOENT' });

const VORTEX_API_MOCK = {
    log: () => undefined,
    util: {
        toBlue: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => Promise.resolve(fn(...args)),
        GameStoreHelper: { findByAppId: async () => ({ gamePath: GAME_FOLDER }) },
        opn: async () => undefined,
        SevenZip: class {
            async add() {
                return { code: 0 };
            }

            async extractFull() {
                return { code: 0 };
            }
        },
    },
    selectors: {
        discoveryByGame: () => ({ path: GAME_FOLDER }),
        activeGameId: () => GAME_ID,
        profileById: () => ({ gameId: GAME_ID }),
        notifications: () => [],
    },
    fs: {
        statSync(file: string) {
            if (!world.files.has(file)) {
                throw missing(file);
            }
        },
        async statAsync(file: string) {
            if (!world.files.has(file)) {
                throw missing(file);
            }
            return { mtimeMs: world.files.get(file) };
        },
        ensureDirWritableAsync: async () => undefined,
        ensureDirAsync: async () => undefined,
        renameAsync: async () => undefined,
        async removeAsync(file: string) {
            world.removed.push(file);
        },
    },
};

/** Answers anything an add-on asks of Vortex that the mock above doesn't know, so any add-on can load */
const ANYTHING: unknown = new Proxy(function anything() { /* callable */ }, {
    get: (_target, key) => key === 'then' || typeof key === 'symbol' ? undefined : ANYTHING,
    apply: () => ANYTHING,
    construct: () => ANYTHING as object,
});

function permissive<T extends object>(target: T): T {
    return new Proxy(target, { get: (object, key) => key in object ? Reflect.get(object, key) : ANYTHING });
}

const PERMISSIVE_VORTEX_API = permissive({
    ...VORTEX_API_MOCK,
    util: permissive(VORTEX_API_MOCK.util),
    selectors: permissive(VORTEX_API_MOCK.selectors),
    fs: permissive(VORTEX_API_MOCK.fs),
});

const moduleInternals = Module as unknown as { _load(request: string, parent: unknown, isMain: boolean): unknown };

/** Like Vortex, which hands an extension only a stub while it installs or updates it */
function stubContext(): unknown {
    return new Proxy({ api: { translate: (text: string) => text } }, {
        get: (target, name) => name in target ? target[name as keyof typeof target] : () => undefined,
    });
}

/** A running extension, as far as Vortex can tell */
class LoadedExtension {
    readonly installers: Installer[] = [];
    readonly modTypes: string[] = [];
    readonly startHooks: StartHook[] = [];
    readonly actions: string[] = [];
    readonly asyncEvents: string[] = [];
    readonly once: (() => void)[] = [];
    game!: RegisteredGame;
    games = 0;

    constructor(choices: AddonChoices) {
        const api = permissive({
            getState: () => ({ persistent: { mods: { [GAME_ID]: world.mods } } }),
            sendNotification: (notification: { id: string }) => world.notifications.push(notification.id),
            dismissNotification: (notificationId: string) => world.dismissed.push(notificationId),
            onStateChange: () => undefined,
            onAsync: (event: string) => this.asyncEvents.push(event),
            showErrorNotification: () => undefined,
            get ext() {
                return world.bepInExSupport ? { bepinexAddGame: (config: Record<string, unknown>) => world.bepInExGames.push(config) } : {};
            },
        });
        const context = permissive({
            api,
            registerGame: (game: RegisteredGame) => {
                this.game = game;
                this.games += 1;
            },
            registerInstaller: (installerId: string, priority: number, test: Installer['test'], install: Installer['install']) => this.installers.push({ id: installerId, priority, test, install }),
            registerModType: (typeId: string) => this.modTypes.push(typeId),
            registerStartHook: (_priority: number, _hookId: string, hook: StartHook) => this.startHooks.push(hook),
            registerAction: (...args: unknown[]) => this.actions.push(args[4] as string),
            once: (callback: () => void) => this.once.push(callback),
        });
        assert.strictEqual(mainOf(choices)(context), true);
        this.once.forEach(callback => callback());
    }

    /** Asks the installers in Vortex's order, with what Vortex's own BepInEx support would claim before the game's */
    async claimant(files: string[]): Promise<Installer | undefined> {
        const installers = [...(world.bepInExGames.length > 0 ? VORTEX_BEPINEX_INSTALLERS : []), ...this.installers].sort((left, right) => left.priority - right.priority);
        for (const installer of installers) {
            if ((await installer.test(files, GAME_ID)).supported) {
                return installer;
            }
        }
        return undefined;
    }

    async install(files: string[]): Promise<{ installer: string; instructions: Instruction[] }> {
        const installer = await this.claimant(files);
        assert.ok(installer?.install, `an installer of the extension claims ${files.join(', ')}, not ${installer?.id}`);
        const { instructions } = await installer.install(files, path.join(path.sep, 'staging'), GAME_ID, () => undefined);
        return { installer: installer.id, instructions };
    }
}

const INJECTOR_FILES = ['0Harmony.dll', 'BepInEx.dll', 'BepInEx.Harmony.dll', 'BepInEx.Preloader.dll', 'Mono.Cecil.dll', 'Mono.Cecil.Mdb.dll', 'Mono.Cecil.Pdb.dll', 'Mono.Cecil.Rocks.dll', 'MonoMod.RuntimeDetour.dll', 'MonoMod.Utils.dll'];
const ROOT_MOD_FOLDERS = ['plugins', 'config', 'patchers'];

/** The two installers of Vortex's BepInEx support, both at priority 10 */
const VORTEX_BEPINEX_INSTALLERS: Installer[] = [
    {
        id: 'bepis-injector-extensible',
        priority: 10,
        test: async files => ({ supported: files.filter(file => INJECTOR_FILES.includes(path.basename(file))).length > 8 }),
    },
    {
        id: 'bepinex-root',
        priority: 10,
        test: async files => ({ supported: files.some(file => ROOT_MOD_FOLDERS.includes(file.split(path.sep)[0])) }),
    },
];

function mainOf(choices: AddonChoices): (context: unknown) => boolean {
    const folder = FOLDER_OF.get(outcomeKey(choices));
    assert.ok(folder, `no outcome has ${JSON.stringify(choices)}`);
    return require(path.join(EMIT_FOLDER, folder, 'src', 'index.js')).default;
}

/** One program for every outcome, which takes seconds where one run per outcome took a minute */
async function compileOutcomes(): Promise<void> {
    const template = JSON.parse(fs.readFileSync(path.join(OUTCOMES_FOLDER, '0', 'tsconfig.json'), 'utf8'));
    fs.writeFileSync(path.join(OUTCOMES_FOLDER, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { ...template.compilerOptions, rootDir: '.' },
        include: ['*/src/**/*.ts'],
    }, null, 4));
    const index = OUTCOMES.map((outcome, folder) => `${folder}: ${outcome.label}`).join('\n');
    const failed = (error: Error & { stdout?: string; stderr?: string }): never => {
        throw new Error(`${error.stdout ?? ''}${error.stderr ?? ''}\nThe numbered folders are:\n${index}`);
    };
    await runShell(`node "${TSC}" -p "${OUTCOMES_FOLDER}"`).catch(failed);
    await runShell(`node "${TSC}" -p "${OUTCOMES_FOLDER}" --noEmit false --noCheck --outDir "${EMIT_FOLDER}" --module node16 --moduleResolution node16 --sourceMap false --inlineSources false`)
        .catch(failed);
}

const native = (...segments: string[]) => path.join(...segments);
const copies = (instructions: readonly Instruction[]) => instructions.filter(instruction => instruction.type === 'copy').map(instruction => instruction.destination);
const typesOf = (instructions: readonly Instruction[]) => instructions.filter(instruction => instruction.type === 'setmodtype').map(instruction => instruction.value);
const inGame = (...segments: string[]) => path.join(GAME_FOLDER, EXE_FOLDER, ...segments);
const installed = (...files: string[]) => files.forEach(file => world.files.set(file, 100));

const MELON_LOADER_RELEASE = [native('MelonLoader.x64', 'version.dll'), native('MelonLoader.x64', 'MelonLoader', 'net6', 'MelonLoader.dll'), native('MelonLoader.x64', 'MelonLoader', 'Dependencies', 'Il2CppAssemblyGenerator.dll')];
const BEPINEX_RELEASE = INJECTOR_FILES.map(file => native('BepInEx', 'core', file));
const MELON_LOADER_INSTALLED = inGame('MelonLoader', 'net6', 'MelonLoader.dll');
const BEPINEX_MONO_INSTALLED = inGame('BepInEx', 'core', 'BepInEx.dll');
const BEPINEX_IL2CPP_INSTALLED = inGame('BepInEx', 'core', 'BepInEx.Unity.IL2CPP.dll');
const DISCOVERY = { path: GAME_FOLDER };

suite('Generated extensions', () => {
    const originalLoad = moduleInternals._load;

    suiteSetup(async function () {
        this.timeout(COMPILE_TIMEOUT_MS);
        fs.rmSync(OUTCOMES_FOLDER, { recursive: true, force: true });
        OUTCOMES.forEach((outcome, index) => writeOutputs(path.join(OUTCOMES_FOLDER, String(index)), renderProject({
            ...AWKWARD_VALUES,
            addons: outcome.choices.addons,
            addonOptions: outcome.choices.options,
        })));
        await compileOutcomes();
        moduleInternals._load = function load(request, parent, isMain) {
            return request === 'vortex-api' ? PERMISSIVE_VORTEX_API : originalLoad.call(this, request, parent, isMain);
        };
    });

    suiteTeardown(() => {
        moduleInternals._load = originalLoad;
        fs.rmSync(OUTCOMES_FOLDER, { recursive: true, force: true });
    });

    setup(() => {
        world = newWorld();
    });

    for (const { label, choices } of OUTCOMES) {
        test(`${label}: loads with the stub context, registers its game once and gives every installer its own id`, () => {
            assert.strictEqual(mainOf(choices)(stubContext()), true);
            const extension = new LoadedExtension(choices);
            assert.strictEqual(extension.games, 1);
            const ids = extension.installers.map(installer => installer.id);
            assert.deepStrictEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
        });
    }

    test('plain: installs its file types into the mods folder', async () => {
        const extension = new LoadedExtension(SELECTIONS.plain);
        assert.strictEqual(extension.game.queryModPath(), 'mods');
        const { instructions } = await extension.install([native('Wrapper', 'Cool.pak'), native('Wrapper', 'readme.txt')]);
        assert.deepStrictEqual(copies(instructions), ['Cool.pak']);
        assert.strictEqual(await extension.claimant(['Cool.dll']), undefined);
    });

    suite('MelonLoader', () => {
        test('installs into its folders next to the executable', async () => {
            const extension = new LoadedExtension(SELECTIONS.melonLoader);
            assert.strictEqual(extension.game.queryModPath(), '.');
            const { installer, instructions } = await extension.install([native('Wrapper', 'Cool.dll'), native('Wrapper', 'Cool.cfg'), native('Wrapper', 'readme.txt')]);
            assert.strictEqual(installer, `${GAME_ID}-melonloader-mods`);
            assert.deepStrictEqual(copies(instructions), [native(EXE_FOLDER, 'Mods', 'Cool.dll'), native(EXE_FOLDER, 'UserData', 'Cool.cfg')]);
            assert.deepStrictEqual(typesOf(instructions), []);
        });

        test('files already in one of its folders stay there', async () => {
            const { instructions } = await new LoadedExtension(SELECTIONS.melonLoader).install([
                native('Wrapper', 'mods', 'Cool.dll'),
                native('UserLibs', 'Lib.dll'),
                native('Plugins', 'Plugin.dll'),
                native('UserData', 'Cool', 'data.json'),
            ]);
            assert.deepStrictEqual(copies(instructions), [
                native(EXE_FOLDER, 'Mods', 'Cool.dll'),
                native(EXE_FOLDER, 'UserLibs', 'Lib.dll'),
                native(EXE_FOLDER, 'Plugins', 'Plugin.dll'),
                native(EXE_FOLDER, 'UserData', 'Cool', 'data.json'),
            ]);
        });

        test('installs its own release as it is, without a wrapper folder', async () => {
            const { installer, instructions } = await new LoadedExtension(SELECTIONS.melonLoader).install(MELON_LOADER_RELEASE);
            assert.strictEqual(installer, `${GAME_ID}-melonloader-package`);
            assert.deepStrictEqual(copies(instructions), [native(EXE_FOLDER, 'version.dll'), native(EXE_FOLDER, 'MelonLoader', 'net6', 'MelonLoader.dll'), native(EXE_FOLDER, 'MelonLoader', 'Dependencies', 'Il2CppAssemblyGenerator.dll')]);
        });

        test('warns while it is missing', async () => {
            const extension = new LoadedExtension(SELECTIONS.melonLoader);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, [`${GAME_ID}-melonloader-missing`]);

            world.notifications.length = 0;
            installed(MELON_LOADER_INSTALLED);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, []);
            assert.deepStrictEqual(world.dismissed, [`${GAME_ID}-melonloader-missing`]);
        });
    });

    suite('BepInEx', () => {
        test('Vortex downloads the Mono build by itself', () => {
            new LoadedExtension(SELECTIONS.bepInExMono);
            assert.deepStrictEqual(world.bepInExGames, [{ gameId: GAME_ID, autoDownloadBepInEx: true, forceGithubDownload: false, architecture: 'x64', unityBuild: 'unitymono', installRelPath: EXE_FOLDER }]);
        });

        test('Vortex does not download the IL2CPP build', () => {
            new LoadedExtension(SELECTIONS.bepInExIl2cpp);
            assert.deepStrictEqual(world.bepInExGames, [{ gameId: GAME_ID, autoDownloadBepInEx: false, forceGithubDownload: true, architecture: 'x64', unityBuild: 'unityil2cpp', installRelPath: EXE_FOLDER }]);
        });

        test('works without Vortex\'s BepInEx support', async () => {
            world.bepInExSupport = false;
            const { instructions } = await new LoadedExtension(SELECTIONS.bepInExMono).install(['Cool.dll']);
            assert.deepStrictEqual(copies(instructions), ['Cool.dll']);
        });

        test('installs into the plugins folder', async () => {
            const extension = new LoadedExtension(SELECTIONS.bepInExMono);
            assert.strictEqual(extension.game.queryModPath(), `${EXE_FOLDER}/BepInEx/plugins`);
            const { installer, instructions } = await extension.install([native('Wrapper', 'Cool.dll'), native('Wrapper', 'readme.txt')]);
            assert.strictEqual(installer, `${GAME_ID}-bepinex-mods`);
            assert.deepStrictEqual(copies(instructions), ['Cool.dll']);
        });

        test('a plugin inside a plugins folder keeps its subfolders', async () => {
            const { instructions } = await new LoadedExtension(SELECTIONS.bepInExMono).install([native('BepInEx', 'plugins', 'Cool', 'Cool.dll'), native('BepInEx', 'plugins', 'Cool', 'assets.bundle')]);
            assert.deepStrictEqual(copies(instructions), [native('Cool', 'Cool.dll'), native('Cool', 'assets.bundle')]);
        });

        test('leaves what Vortex\'s BepInEx support handles to it', async () => {
            const extension = new LoadedExtension(SELECTIONS.bepInExMono);
            assert.strictEqual((await extension.claimant(BEPINEX_RELEASE))?.id, 'bepis-injector-extensible');
            assert.strictEqual((await extension.claimant([native('plugins', 'Cool.dll')]))?.id, 'bepinex-root');
        });

        test('does not take BepInEx itself for a plugin when Vortex\'s support is off', async () => {
            world.bepInExSupport = false;
            assert.strictEqual(await new LoadedExtension(SELECTIONS.bepInExMono).claimant(BEPINEX_RELEASE), undefined);
        });

        test('warns about a missing IL2CPP build only', async () => {
            await new LoadedExtension(SELECTIONS.bepInExMono).game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, []);

            const il2cpp = new LoadedExtension(SELECTIONS.bepInExIl2cpp);
            await il2cpp.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, [`${GAME_ID}-bepinex-missing`]);

            world.notifications.length = 0;
            installed(BEPINEX_IL2CPP_INSTALLED);
            await il2cpp.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, []);
        });
    });

    suite('MelonLoader and BepInEx together', () => {
        const ROOT_TYPE = `${GAME_ID}-root`;
        const BEPINEX_MODS = `${GAME_ID}-bepinex-mods`;
        const MELON_LOADER_MODS = `${GAME_ID}-melonloader-mods`;

        for (const [name, selection] of [['Mono', SELECTIONS.bothMono], ['IL2CPP', SELECTIONS.bothIl2cpp]] as const) {
            test(`${name}: Vortex never downloads BepInEx by itself`, () => {
                new LoadedExtension(selection);
                assert.strictEqual(world.bepInExGames[0].autoDownloadBepInEx, false);
                assert.strictEqual(world.bepInExGames[0].forceGithubDownload, true);
            });
        }

        test('a marker file decides', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            assert.strictEqual((await extension.install(['_bepinex', 'Cool.dll'])).installer, BEPINEX_MODS);
            assert.strictEqual((await extension.install(['_melonloader', 'Cool.dll'])).installer, MELON_LOADER_MODS);
        });

        test('a marker file is never installed', async () => {
            const { instructions } = await new LoadedExtension(SELECTIONS.bothIl2cpp).install(['_melonloader', 'Cool.dll']);
            assert.deepStrictEqual(copies(instructions), [native(EXE_FOLDER, 'Mods', 'Cool.dll')]);
        });

        test('a marker wins over a path that names the other loader', async () => {
            const { installer } = await new LoadedExtension(SELECTIONS.bothIl2cpp).install(['_melonloader', native('BepInEx version', 'Cool.dll')]);
            assert.strictEqual(installer, MELON_LOADER_MODS);
        });

        test('otherwise a path that names a loader decides', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            assert.strictEqual((await extension.install([native('For BepInEx', 'Cool.dll')])).installer, BEPINEX_MODS);
            assert.strictEqual((await extension.install([native('For MelonLoader', 'Cool.dll')])).installer, MELON_LOADER_MODS);
        });

        test('otherwise the installed loader decides, and MelonLoader is the default', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            assert.strictEqual((await extension.install(['Cool.dll'])).installer, MELON_LOADER_MODS);

            installed(BEPINEX_IL2CPP_INSTALLED);
            assert.strictEqual((await extension.install(['Cool.dll'])).installer, BEPINEX_MODS);

            installed(MELON_LOADER_INSTALLED);
            assert.strictEqual((await extension.install(['Cool.dll'])).installer, MELON_LOADER_MODS);
        });

        test('a loader installed through Vortex counts before it is deployed', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            world.mods = { bepinex: { type: 'bepinex-injector', attributes: {} } };
            assert.strictEqual((await extension.install(['Cool.dll'])).installer, BEPINEX_MODS);

            world.mods = { ...world.mods, melon: { type: ROOT_TYPE, attributes: { melonLoaderPackage: true } } };
            assert.strictEqual((await extension.install(['Cool.dll'])).installer, MELON_LOADER_MODS);
        });

        test('MelonLoader\'s files get the game root type, or Vortex would claim them for BepInEx', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            assert.deepStrictEqual(extension.modTypes, [ROOT_TYPE]);
            assert.deepStrictEqual(typesOf((await extension.install(['Cool.dll'])).instructions), [ROOT_TYPE]);

            const { instructions } = await extension.install(MELON_LOADER_RELEASE);
            assert.deepStrictEqual(typesOf(instructions), [ROOT_TYPE]);
            assert.deepStrictEqual(instructions.filter(instruction => instruction.type === 'attribute').map(({ key, value }) => [key, value]), [['melonLoaderPackage', true]]);
        });

        test('BepInEx plugins go to the plugins folder without a mod type', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothIl2cpp);
            assert.strictEqual(extension.game.queryModPath(), `${EXE_FOLDER}/BepInEx/plugins`);
            const { instructions } = await extension.install(['_bepinex', 'Cool.dll']);
            assert.deepStrictEqual(copies(instructions), ['Cool.dll']);
            assert.deepStrictEqual(typesOf(instructions), []);
        });

        test('leaves BepInEx itself to Vortex and takes MelonLoader itself', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothMono);
            assert.strictEqual((await extension.claimant(BEPINEX_RELEASE))?.id, 'bepis-injector-extensible');
            assert.strictEqual((await extension.claimant(MELON_LOADER_RELEASE))?.id, `${GAME_ID}-melonloader-package`);
        });

        test('neither installer takes BepInEx itself when Vortex\'s support is off', async () => {
            world.bepInExSupport = false;
            assert.strictEqual(await new LoadedExtension(SELECTIONS.bothMono).claimant(BEPINEX_RELEASE), undefined);
        });

        test('warns when neither or both loaders are installed', async () => {
            const extension = new LoadedExtension(SELECTIONS.bothMono);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, [`${GAME_ID}-no-mod-loader`]);

            world.notifications.length = 0;
            installed(MELON_LOADER_INSTALLED);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, []);

            installed(BEPINEX_MONO_INSTALLED);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, [`${GAME_ID}-both-mod-loaders`]);
        });
    });

    suite('Godot Mod Loader', () => {
        const HOOK_PACK = inGame('mod-hooks.zip');
        const PCK = inGame('Game.pck');
        const EXE = inGame('Game.exe');
        const GAME_CALL = () => ({ executable: EXE, args: ['--keep'], options: {} });

        test('registers everything around the loader', () => {
            const extension = new LoadedExtension(SELECTIONS.gml);
            assert.strictEqual(extension.game.queryModPath(), `${EXE_FOLDER}/mods`);
            assert.deepStrictEqual(extension.installers.map(installer => [installer.id, installer.priority]), [[`${GAME_ID}-gml-loader`, 10], [`${GAME_ID}-mod-zips`, 20], [`${GAME_ID}-unpacked-mods`, 25]]);
            assert.strictEqual(extension.startHooks.length, 1);
            assert.deepStrictEqual(extension.actions, ['Reinstall Godot Mod Loader']);
            assert.deepStrictEqual(extension.asyncEvents, ['did-deploy', 'did-purge']);
        });

        test('installs a mod zip under a lower-case extension', async () => {
            const { installer, instructions } = await new LoadedExtension(SELECTIONS.gml).install([native('Wrapper', 'Cool-Mod.ZIP')]);
            assert.strictEqual(installer, `${GAME_ID}-mod-zips`);
            assert.deepStrictEqual(copies(instructions), ['Cool-Mod.zip']);
        });

        test('zips an extracted mod again', async () => {
            const { installer, instructions } = await new LoadedExtension(SELECTIONS.gml).install([
                native('Wrapper', 'mods-unpacked', 'Cool-Mod', 'mod_main.gd'),
                native('Wrapper', 'mods-unpacked', 'Cool-Mod', 'manifest.json'),
            ]);
            assert.strictEqual(installer, `${GAME_ID}-unpacked-mods`);
            assert.deepStrictEqual(copies(instructions), ['Cool-Mod.zip']);
        });

        test('refuses the loader itself as a mod', async () => {
            const { installer, instructions } = await new LoadedExtension(SELECTIONS.gml).install([native('addons', 'mod_loader', 'mod_loader.gd')]);
            assert.strictEqual(installer, `${GAME_ID}-gml-loader`);
            assert.deepStrictEqual(instructions.map(instruction => instruction.type), ['error']);
        });

        test('leaves other archives alone', async () => {
            assert.strictEqual(await new LoadedExtension(SELECTIONS.gml).claimant(['Cool.pak']), undefined);
        });

        test('warns while the loader is missing in either folder', async () => {
            const extension = new LoadedExtension(SELECTIONS.gml);
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, [`${GAME_ID}-gml-missing`]);

            world.notifications.length = 0;
            for (const folder of [GAME_FOLDER, inGame()]) {
                installed(
                    path.join(folder, 'addons', 'mod_loader', 'mod_loader.gd'),
                    path.join(folder, 'addons', 'mod_loader', 'mod_loader_setup.gd'),
                    path.join(folder, 'addons', 'mod_loader', 'vendor', 'GDRE', 'gdre_tools.exe'),
                );
            }
            await extension.game.setup(DISCOVERY);
            assert.deepStrictEqual(world.notifications, []);
        });

        test('clears the caches when the game is newer than the hook pack', async () => {
            world.files.set(HOOK_PACK, 100);
            world.files.set(PCK, 200);
            await new LoadedExtension(SELECTIONS.gml).game.setup(DISCOVERY);
            assert.deepStrictEqual(world.removed, [HOOK_PACK, inGame('addons', 'mod_loader', 'decomp')]);
        });

        test('keeps a current hook pack', async () => {
            world.files.set(HOOK_PACK, 200);
            world.files.set(PCK, 100);
            await new LoadedExtension(SELECTIONS.gml).game.setup(DISCOVERY);
            assert.deepStrictEqual(world.removed, []);
        });

        test('a game with an embedded pck compares against the executable', async () => {
            world.files.set(HOOK_PACK, 200);
            world.files.set(EXE, 100);
            await new LoadedExtension(SELECTIONS.gml).game.setup(DISCOVERY);
            assert.deepStrictEqual(world.removed, []);
        });

        test('the start hook adds the setup arguments for this game only', async () => {
            const [hook] = new LoadedExtension(SELECTIONS.gml).startHooks;
            assert.deepStrictEqual((await hook(GAME_CALL())).args, ['--keep'], 'nothing without the setup script');

            installed(inGame('addons', 'mod_loader', 'mod_loader_setup.gd'));
            assert.deepStrictEqual((await hook(GAME_CALL())).args, ['--script', 'addons/mod_loader/mod_loader_setup.gd', '--keep']);
            assert.deepStrictEqual((await hook({ ...GAME_CALL(), executable: inGame('Other.exe') })).args, ['--keep'], 'another program stays untouched');
        });
    });
});
