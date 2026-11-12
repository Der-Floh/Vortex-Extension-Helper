import { BEPINEX_BUILD_IL2CPP, BEPINEX_BUILD_MONO, MOD_LOADER_BEPINEX, MOD_LOADER_GML, MOD_LOADER_MELON_LOADER } from '../../constants';
import type { ProjectValues } from '../../types/project';

export interface LoaderOutcome {
    /** Also a folder name, so it has to be a valid start of a URL scheme */
    readonly id: string;
    readonly choice: Pick<ProjectValues, 'modLoaders' | 'bepInExBuild'>;
}

/** Everything the wizard can generate */
export const LOADER_OUTCOMES: readonly LoaderOutcome[] = [
    { id: 'plain', choice: {} },
    { id: 'gml', choice: { modLoaders: [MOD_LOADER_GML] } },
    { id: 'melonloader', choice: { modLoaders: [MOD_LOADER_MELON_LOADER] } },
    { id: 'bepinex-mono', choice: { modLoaders: [MOD_LOADER_BEPINEX], bepInExBuild: BEPINEX_BUILD_MONO } },
    { id: 'bepinex-il2cpp', choice: { modLoaders: [MOD_LOADER_BEPINEX], bepInExBuild: BEPINEX_BUILD_IL2CPP } },
    { id: 'both-mono', choice: { modLoaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX], bepInExBuild: BEPINEX_BUILD_MONO } },
    { id: 'both-il2cpp', choice: { modLoaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX], bepInExBuild: BEPINEX_BUILD_IL2CPP } },
];
