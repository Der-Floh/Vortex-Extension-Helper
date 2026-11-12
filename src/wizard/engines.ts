import { MOD_LOADER_BEPINEX, MOD_LOADER_GML, MOD_LOADER_MELON_LOADER } from '../constants';
import type { ModLoaderId } from '../types/project';

export interface GameEngine {
    readonly label: string;
    /** Known games on the engine, shown next to its name */
    readonly examples: string;
    /** The mod loaders the wizard offers for the engine; none skips that question */
    readonly loaders: readonly ModLoaderId[];
}

export const GAME_ENGINES: readonly GameEngine[] = Object.freeze([
    { label: 'Unreal Engine', examples: 'Palworld, Hogwarts Legacy', loaders: [] },
    { label: 'Unity', examples: 'Vampire Survivors, Valheim', loaders: [MOD_LOADER_MELON_LOADER, MOD_LOADER_BEPINEX] },
    { label: 'Godot', examples: 'Coal LLC, Brotato', loaders: [MOD_LOADER_GML] },
    { label: 'Source', examples: 'Left 4 Dead 2, Garry\'s Mod', loaders: [] },
    { label: 'GameMaker', examples: 'Undertale, Hotline Miami', loaders: [] },
    { label: 'Frostbite', examples: 'Battlefield 1, Dragon Age: Inquisition', loaders: [] },
    { label: 'Other', examples: 'Any other engine, or not sure', loaders: [] },
]);
