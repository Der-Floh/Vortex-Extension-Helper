import * as assert from 'assert';
import pkg from '../../../package.json';
import {
    COMMAND_ADD_VORTEX_LIBRARY,
    COMMAND_CREATE_MISSING_FILES,
    COMMAND_INSTALL_DEPENDENCIES,
    COMMAND_NEW_GAME_EXTENSION,
    COMMAND_OPEN_DOCUMENTATION,
    COMMAND_RUN_WORKSPACE_CHECKS,
    CONTEXT_IS_VORTEX_WORKSPACE,
} from '../../constants';

suite('Manifest', () => {
    test('the command constants match the contributed order', () => {
        assert.deepStrictEqual(
            [COMMAND_NEW_GAME_EXTENSION, COMMAND_INSTALL_DEPENDENCIES, COMMAND_CREATE_MISSING_FILES, COMMAND_RUN_WORKSPACE_CHECKS, COMMAND_OPEN_DOCUMENTATION, COMMAND_ADD_VORTEX_LIBRARY],
            [
                'vortexHelper.newGameSupportExtension',
                'vortexHelper.setupVortexApi',
                'vortexHelper.scaffoldGameExtension',
                'vortexHelper.runWorkspaceChecks',
                'vortexHelper.openDocumentation',
                'vortexHelper.addVortexLibrary',
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
        });
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
