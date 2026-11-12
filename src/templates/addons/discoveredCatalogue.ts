import discovered from 'virtual:template-addons';
import categories from '../catalogue/categories.json';
import engines from '../catalogue/engines.json';
import type { Catalogue } from './addon';

/** Every add-on folder below `src/templates/files/src`, found and validated at build time by `esbuild.addons.mjs` */
export const DISCOVERED_CATALOGUE: Catalogue = Object.freeze({ engines, categories, addons: discovered.addons });
