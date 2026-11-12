import { spec } from '../fileSpec';
import loaderFiles from '../files/src/archive/loaderFiles.ts?text';

/** What MelonLoader and BepInEx both use to read an archive, generated once when both are picked */
export const LOADER_ARCHIVE_HELPERS = spec('src/archive/loaderFiles.ts', loaderFiles);
