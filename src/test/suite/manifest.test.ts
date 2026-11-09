import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import pkg from '../../../package.json';
import {
    COMMAND_ADD_VORTEX_LIBRARY,
    COMMAND_ATTACH_TO_VORTEX,
    COMMAND_BUILD,
    COMMAND_CREATE_MISSING_FILES,
    COMMAND_DEBUG_IN_VORTEX,
    COMMAND_DEPLOY_TO_VORTEX,
    COMMAND_INSERT_SNIPPET,
    COMMAND_INSTALL_DEPENDENCIES,
    COMMAND_NEW_GAME_EXTENSION,
    COMMAND_OPEN_DOCUMENTATION,
    COMMAND_OPEN_PLUGINS_FOLDER,
    COMMAND_OPEN_VORTEX_LOG,
    COMMAND_PACKAGE_ZIP,
    COMMAND_REFRESH_SIDEBAR,
    COMMAND_REMOVE_VORTEX_LIBRARY,
    COMMAND_RUN_WORKSPACE_CHECKS,
    CONTEXT_DETECTION_DONE,
    CONTEXT_IS_VORTEX_WORKSPACE,
    ROW_ATTACHABLE,
    ROW_DEPENDENCIES_MISSING,
    ROW_DEPLOYABLE,
    ROW_LIBRARY_ADDED,
    ROW_LIBRARY_AVAILABLE,
    ROW_LIBRARY_UNLISTED,
    ROW_SNIPPET,
    VIEW_SIDEBAR,
} from '../../constants';

const ROWS_WITH_BUTTONS = [ROW_ATTACHABLE, ROW_DEPENDENCIES_MISSING, ROW_DEPLOYABLE, ROW_LIBRARY_ADDED, ROW_LIBRARY_AVAILABLE, ROW_LIBRARY_UNLISTED, ROW_SNIPPET];

suite('Manifest', () => {
    test('the command constants match the contributed order', () => {
        assert.deepStrictEqual(
            [
                COMMAND_NEW_GAME_EXTENSION,
                COMMAND_INSTALL_DEPENDENCIES,
                COMMAND_CREATE_MISSING_FILES,
                COMMAND_RUN_WORKSPACE_CHECKS,
                COMMAND_OPEN_DOCUMENTATION,
                COMMAND_ADD_VORTEX_LIBRARY,
                COMMAND_DEBUG_IN_VORTEX,
                COMMAND_BUILD,
                COMMAND_PACKAGE_ZIP,
                COMMAND_DEPLOY_TO_VORTEX,
                COMMAND_ATTACH_TO_VORTEX,
                COMMAND_REMOVE_VORTEX_LIBRARY,
                COMMAND_INSERT_SNIPPET,
                COMMAND_OPEN_PLUGINS_FOLDER,
                COMMAND_OPEN_VORTEX_LOG,
                COMMAND_REFRESH_SIDEBAR,
            ],
            [
                'vortexHelper.newGameSupportExtension',
                'vortexHelper.setupVortexApi',
                'vortexHelper.scaffoldGameExtension',
                'vortexHelper.runWorkspaceChecks',
                'vortexHelper.openDocumentation',
                'vortexHelper.addVortexLibrary',
                'vortexHelper.debugInVortex',
                'vortexHelper.build',
                'vortexHelper.packageZip',
                'vortexHelper.deployToVortex',
                'vortexHelper.attachToVortex',
                'vortexHelper.removeVortexLibrary',
                'vortexHelper.insertSnippet',
                'vortexHelper.openPluginsFolder',
                'vortexHelper.openVortexLog',
                'vortexHelper.refreshSidebar',
            ]
        );
    });

    test('every command is in the Vortex category', () => {
        for (const command of pkg.contributes.commands) {
            assert.strictEqual(command.category, 'Vortex', command.command);
        }
    });

    test('commands that need a project or npm are hidden when they cannot run', () => {
        const when = Object.fromEntries(pkg.contributes.menus.commandPalette.map(entry => [entry.command, entry.when]));
        assert.deepStrictEqual(when, {
            [COMMAND_INSTALL_DEPENDENCIES]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_CREATE_MISSING_FILES]: CONTEXT_IS_VORTEX_WORKSPACE,
            [COMMAND_RUN_WORKSPACE_CHECKS]: 'workspaceFolderCount > 0',
            [COMMAND_ADD_VORTEX_LIBRARY]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_DEBUG_IN_VORTEX]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_BUILD]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_PACKAGE_ZIP]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_DEPLOY_TO_VORTEX]: `${CONTEXT_IS_VORTEX_WORKSPACE} && isWorkspaceTrusted`,
            [COMMAND_ATTACH_TO_VORTEX]: 'false',
            [COMMAND_REMOVE_VORTEX_LIBRARY]: 'false',
            [COMMAND_INSERT_SNIPPET]: 'false',
            [COMMAND_OPEN_PLUGINS_FOLDER]: CONTEXT_IS_VORTEX_WORKSPACE,
            [COMMAND_OPEN_VORTEX_LOG]: CONTEXT_IS_VORTEX_WORKSPACE,
            [COMMAND_REFRESH_SIDEBAR]: 'false',
        });
    });

    test('every inline button belongs to the sidebar, names a known command and row, and needs a trusted workspace', () => {
        const contributed = new Set(pkg.contributes.commands.map(command => command.command));
        for (const button of pkg.contributes.menus['view/item/context']) {
            assert.ok(contributed.has(button.command), button.command);
            assert.strictEqual(button.group, 'inline', button.command);
            assert.ok(button.when.includes(`view == ${VIEW_SIDEBAR}`), button.when);
            assert.ok(button.when.includes('isWorkspaceTrusted'), button.when);
            assert.ok(ROWS_WITH_BUTTONS.includes(/viewItem == (\w+)/.exec(button.when)?.[1] ?? ''), button.when);
        }
    });

    test('every row that is meant to have a button has one', () => {
        const buttons = pkg.contributes.menus['view/item/context'].map(button => /viewItem == (\w+)/.exec(button.when)?.[1]);
        assert.deepStrictEqual(ROWS_WITH_BUTTONS.filter(row => !buttons.includes(row)), []);
    });

    test('a command shown as a button has an icon, which is all a button shows', () => {
        const icons = new Map(pkg.contributes.commands.map(command => [command.command, 'icon' in command ? command.icon : undefined]));
        for (const { command } of [...pkg.contributes.menus['view/item/context'], ...pkg.contributes.menus['view/title']]) {
            assert.ok(icons.get(command), command);
        }
    });

    test('the sidebar has its own container, with an icon that ships', () => {
        const [container] = pkg.contributes.viewsContainers.activitybar;
        assert.deepStrictEqual(Object.keys(pkg.contributes.views), [container.id]);
        assert.strictEqual(VIEW_SIDEBAR, pkg.contributes.views.vortexHelper[0].id);
        assert.strictEqual(pkg.contributes.views.vortexHelper[0].icon, container.icon, 'the manifest schema requires an icon on the view too');
        assert.ok(!container.icon.startsWith('assets/meta/'), 'assets/meta is left out of the VSIX');

        const extension = vscode.extensions.getExtension(`${pkg.publisher}.${pkg.name}`);
        assert.ok(extension);
        assert.ok(fs.existsSync(path.join(extension.extensionPath, container.icon)));
    });

    test('the welcome text waits for the first detection', () => {
        assert.deepStrictEqual(pkg.contributes.viewsWelcome.map(welcome => [welcome.view, welcome.when]), [[VIEW_SIDEBAR, CONTEXT_DETECTION_DONE]]);
    });

    test('activates only for folders with a package.json', () => {
        assert.deepStrictEqual(pkg.activationEvents, ['workspaceContains:package.json']);
    });

    test('contributes no task definition, which would add an onTaskType activation', () => {
        assert.ok(!('taskDefinitions' in pkg.contributes));
    });

    test('@types/vscode is pinned to the minor of the engine', () => {
        const engineMinor = /^\^(\d+\.\d+)\./.exec(pkg.engines.vscode)?.[1];
        const typesMinor = /^~(\d+\.\d+)\./.exec(pkg.devDependencies['@types/vscode'])?.[1];
        assert.ok(engineMinor);
        assert.strictEqual(typesMinor, engineMinor);
    });

    test('has no types field', () => {
        assert.ok(!('types' in pkg));
    });
});
