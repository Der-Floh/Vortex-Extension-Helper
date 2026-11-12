import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADDONS_FOLDER = path.join(ROOT, 'src', 'templates', 'files', 'src');
const CATALOGUE_FOLDER = path.join(ROOT, 'src', 'templates', 'catalogue');
const ENGINES_FILE = path.join(CATALOGUE_FOLDER, 'engines.json');
const CATEGORIES_FILE = path.join(CATALOGUE_FOLDER, 'categories.json');
const LOCK_FILE = path.join(CATALOGUE_FOLDER, 'addons.lock.json');
const VALIDATOR = path.join(ROOT, 'src', 'templates', 'addons', 'validateCatalogue.ts');
const MANIFEST = 'addon.json';
const README = 'addon.md';
const VIRTUAL_MODULE = 'virtual:template-addons';
const NAMESPACE = 'template-addons';
const BINARY_EXTENSIONS = new Set(['.7z', '.dll', '.exe', '.gif', '.ico', '.jpeg', '.jpg', '.pck', '.png', '.webp', '.zip']);

const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const readText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const relative = file => path.relative(ROOT, file).replace(/\\/g, '/');

/**
 * Makes every folder below `src/templates/files/src` that has an `addon.json` an add-on: inlines its
 * manifest, `addon.md` and files as `virtual:template-addons`, and fails the build at the add-on's
 * `addon.json` when `validateCatalogue` finds a problem, since packaging runs no tests.
 *
 * @type {() => import('esbuild').Plugin}
 */
export function templateAddonsPlugin() {
    return {
        name: 'template-addons',

        setup(build) {
            build.onResolve({ filter: /^virtual:template-addons$/ }, () => ({ path: VIRTUAL_MODULE, namespace: NAMESPACE }));
            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async () => {
                const watchDirs = foldersFrom(ADDONS_FOLDER);
                const loaded = await loadCatalogue();
                const watchFiles = [ENGINES_FILE, CATEGORIES_FILE, ...watchDirs.flatMap(filesIn), ...loaded.validatorInputs];
                return loaded.errors.length > 0
                    ? { errors: loaded.errors, watchDirs, watchFiles }
                    : { contents: JSON.stringify({ addons: loaded.addons }), loader: 'json', watchDirs, watchFiles };
            });
        },
    };
}

/** Reads the add-on folders as they are on disk, in code unit order so every machine builds the same */
export function discoverAddons() {
    const folders = fs.readdirSync(ADDONS_FOLDER, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort(byCodeUnit);
    const addonFolders = folders.filter(folder => fs.existsSync(path.join(ADDONS_FOLDER, folder, MANIFEST)));
    return {
        reservedFolders: folders.filter(folder => !addonFolders.includes(folder)),
        addons: addonFolders.map(readAddon),
    };
}

/** Writes each add-on's version and content hash to `catalogue/addons.lock.json`, which a test compares */
export function writeLock() {
    const entries = discoverAddons().addons.map(addon => {
        const manifest = JSON.parse(addon.manifestText);
        return [manifest.id, { version: manifest.version, hash: addon.hash }];
    });
    fs.writeFileSync(LOCK_FILE, `${JSON.stringify(Object.fromEntries(entries.sort(([left], [right]) => byCodeUnit(left, right))), null, 4)}\n`);
    return entries.length;
}

async function loadCatalogue() {
    const discovered = discoverAddons();
    const errors = [];
    const parse = (text, file) => {
        try {
            return JSON.parse(text);
        } catch (error) {
            errors.push({ text: `${relative(file)} isn't valid JSON: ${error.message}`, location: { file } });
            return undefined;
        }
    };
    const engines = parse(readText(ENGINES_FILE), ENGINES_FILE);
    const categories = parse(readText(CATEGORIES_FILE), CATEGORIES_FILE);
    const addons = discovered.addons.map(addon => ({ ...addon, manifest: parse(addon.manifestText, path.join(ADDONS_FOLDER, addon.folder, MANIFEST)) }));
    if (errors.length > 0) {
        return { errors, addons: [], validatorInputs: [] };
    }

    const validator = await loadValidator();
    const problems = validator.validateCatalogue({
        engines,
        categories,
        addons: addons.map(({ folder, manifest, files }) => ({ folder, manifest, files })),
        reservedFolders: discovered.reservedFolders,
    });
    return {
        errors: problems.map(problem => ({
            text: problem.folder ? `${problem.folder}: ${problem.message}` : problem.message,
            location: { file: problem.folder ? path.join(ADDONS_FOLDER, problem.folder, MANIFEST) : CATALOGUE_FOLDER },
        })),
        addons: addons.map(({ manifest, readme, files, hash }) => ({ manifest, ...(readme === undefined ? {} : { readme }), files, hash })),
        validatorInputs: validator.inputs,
    };
}

/** Bundles the TypeScript validator in memory, so the build and the tests run the same checks */
async function loadValidator() {
    const result = await esbuild.build({
        entryPoints: [VALIDATOR],
        absWorkingDir: ROOT,
        bundle: true,
        write: false,
        metafile: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        mainFields: ['module', 'main'],
        logLevel: 'silent',
    });
    const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    return { validateCatalogue: module.validateCatalogue, inputs: Object.keys(result.metafile.inputs).map(input => path.resolve(ROOT, input)) };
}

function readAddon(folder) {
    const addonFolder = path.join(ADDONS_FOLDER, folder);
    const manifestText = readText(path.join(addonFolder, MANIFEST));
    const readmeFile = path.join(addonFolder, README);
    const readme = fs.existsSync(readmeFile) ? readText(readmeFile) : undefined;
    const files = filesBelow(addonFolder)
        .filter(file => file !== MANIFEST && file !== README)
        .map(file => readAddonFile(addonFolder, file));
    return { folder, manifestText, readme, files, hash: hashOf(manifestText, readme, files) };
}

function readAddonFile(addonFolder, file) {
    const absolute = path.join(addonFolder, file);
    return BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())
        ? { path: file, base64: fs.readFileSync(absolute).toString('base64') }
        : { path: file, text: readText(absolute) };
}

function hashOf(manifestText, readme, files) {
    const hash = createHash('sha256');
    const add = (name, content) => hash.update(`${name}\0${content}\0`);
    add(MANIFEST, manifestText);
    if (readme !== undefined) {
        add(README, readme);
    }
    for (const file of files) {
        add(file.path, file.text ?? file.base64);
    }
    return hash.digest('hex');
}

/** Every folder from `folder` down, so watch mode notices a new add-on or a new subfolder */
function foldersFrom(folder) {
    return [folder, ...fs.readdirSync(folder, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => foldersFrom(path.join(folder, entry.name)))];
}

function filesIn(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.join(folder, entry.name));
}

/** The files below a folder, relative to it with `/`, in code unit order */
function filesBelow(folder, prefix = '') {
    return fs.readdirSync(folder, { withFileTypes: true })
        .flatMap(entry => entry.isDirectory()
            ? filesBelow(path.join(folder, entry.name), `${prefix}${entry.name}/`)
            : [`${prefix}${entry.name}`])
        .sort(byCodeUnit);
}

if (process.argv.includes('--lock') && path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    console.log(`Locked ${writeLock()} add-ons in ${relative(LOCK_FILE)}.`);
}
