import * as vscode from 'vscode';
import { BEPINEX_BUILD_IL2CPP, BEPINEX_BUILD_MONO, MOD_LOADER_BEPINEX } from '../constants';
import { MOD_LOADERS } from '../templates/loaders/profiles';
import type { BepInExBuild, ModLoaderId, ProjectValues } from '../types/project';
import { GAME_ENGINES, type GameEngine } from './engines';

export type LoaderAnswers = Required<Pick<ProjectValues, 'modLoaders'>> & Pick<ProjectValues, 'bepInExBuild'>;

/** The wizard's questions about the game's engine; each resolves to undefined when it is cancelled */
export interface LoaderPromptUi {
    pickEngine(engines: readonly GameEngine[]): Thenable<GameEngine | undefined>;
    pickLoaders(engine: GameEngine): Thenable<readonly ModLoaderId[] | undefined>;
    pickBepInExBuild(): Thenable<BepInExBuild | undefined>;
}

/** @returns The mod loaders to generate support for, none for a plain project, or undefined if the user cancels */
export async function askModLoaders(ui: LoaderPromptUi = VSCODE_LOADER_PROMPTS): Promise<LoaderAnswers | undefined> {
    const engine = await ui.pickEngine(GAME_ENGINES);
    if (!engine) {
        return undefined;
    }
    if (engine.loaders.length === 0) {
        return { modLoaders: [] };
    }
    const modLoaders = await ui.pickLoaders(engine);
    if (!modLoaders) {
        return undefined;
    }
    if (!modLoaders.includes(MOD_LOADER_BEPINEX)) {
        return { modLoaders };
    }
    const bepInExBuild = await ui.pickBepInExBuild();
    return bepInExBuild ? { modLoaders, bepInExBuild } : undefined;
}

const BEPINEX_BUILDS: (vscode.QuickPickItem & { readonly build: BepInExBuild })[] = [
    { label: 'Mono', detail: 'The game folder has <game>_Data/Managed/Assembly-CSharp.dll.', build: BEPINEX_BUILD_MONO },
    { label: 'IL2CPP', detail: 'The game folder has GameAssembly.dll.', build: BEPINEX_BUILD_IL2CPP },
];

const VSCODE_LOADER_PROMPTS: LoaderPromptUi = {
    async pickEngine(engines) {
        const picked = await vscode.window.showQuickPick(
            engines.map(engine => ({ label: engine.label, description: engine.examples, engine })),
            { title: 'Game engine', placeHolder: 'Which engine does the game use?', ignoreFocusOut: true },
        );
        return picked?.engine;
    },

    async pickLoaders(engine) {
        const picked = await vscode.window.showQuickPick(
            engine.loaders.map(id => ({ ...MOD_LOADERS[id], id })),
            {
                title: `Mod loaders for ${engine.label}`,
                placeHolder: 'Tick what the game\'s mods need, or nothing to just copy mod files',
                canPickMany: true,
                ignoreFocusOut: true,
            },
        );
        return picked?.map(item => item.id);
    },

    async pickBepInExBuild() {
        const picked = await vscode.window.showQuickPick(
            BEPINEX_BUILDS,
            { title: 'BepInEx build', placeHolder: 'Which kind of Unity build is the game?', ignoreFocusOut: true },
        );
        return picked?.build;
    },
};
