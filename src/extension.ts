import * as vscode from 'vscode';
import * as path from 'path';

import { runInstallDeps } from './utils/shellUtils';
import { newGameSupportExtension } from './scaffold/newGameExtension';
import { getRequiredFilesForWorkspace, getVortexCompletionProvider, getVortexWorkspaceType, getWorkspaceRootUri, isVortexWorkspaceType } from './workspace/vortexWorkspaceUtils';
import { checkPendingScaffold, scaffoldGameExtension } from './scaffold/scaffoldFunctions';
import { COMMANDS, MISCELLANEOUS } from './constants/strings';
import { Logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
	Logger.debug(`Activating extension`);

	const workspaceType = await getVortexWorkspaceType();
	const isVortexWorkspace = isVortexWorkspaceType(workspaceType);
	Logger.debug(`Detected workspace type: ${workspaceType}`);

	Logger.debug(`Registering commands`);
	const newGameCmd = vscode.commands.registerCommand(COMMANDS.NEW_GAME_SUPPORT, async () => await newGameSupportExtensionLocal(context));
	const scaffoldCmd = vscode.commands.registerCommand(COMMANDS.SCAFFOLD_GAME_EXTENSION, scaffoldGameExtensionLocal);
	const openDocCmd = vscode.commands.registerCommand(COMMANDS.OPEN_DOCUMENTATION, openDocumentationLocal);
	context.subscriptions.push(newGameCmd, scaffoldCmd, openDocCmd);

	if (isVortexWorkspace) {
		await activateVortexWorkspace(context);
	}

	Logger.debug(`Checking for pending scaffold`);
	const scaffolded = await checkPendingScaffold(context);
	if (scaffolded) {
		const workspaceType = await getVortexWorkspaceType();
		const isVortexWorkspace = isVortexWorkspaceType(workspaceType);
		Logger.debug(`Detected workspace type after scaffolding: ${workspaceType}`);
		if (isVortexWorkspace) {
			await activateVortexWorkspace(context);
		}
	}

	Logger.debug(`Extension activated`);
}

export function deactivate() { }

async function activateVortexWorkspace(context: vscode.ExtensionContext) {
	Logger.debug(`Activating Vortex workspace features`);

	Logger.debug(`Registering commands`);
	const setupVortexApiCmd = vscode.commands.registerCommand(COMMANDS.SETUP_VORTEX_API, setupVortexApiLocal);

	const checkCmd = vscode.commands.registerCommand(COMMANDS.RUN_WORKSPACE_CHECKS, runWorkspaceChecksLocal);

	context.subscriptions.push(setupVortexApiCmd, checkCmd);

	// Register completion provider for JS
	const vortexCompletionProviderInfo = await getVortexCompletionProvider();
	Logger.debug(`Registering completion provider for ${vortexCompletionProviderInfo?.language}`);
	if (!vortexCompletionProviderInfo) {
		vscode.window.showErrorMessage('Failed to initialize Vortex completion provider.');
	} else {
		const completionProvider = vscode.languages.registerCompletionItemProvider(
			{ language: vortexCompletionProviderInfo.language, scheme: 'file' },
			vortexCompletionProviderInfo.instance,
			'.', // trigger on dot
		);
		context.subscriptions.push(completionProvider);
	}

	Logger.debug(`Setting up diagnostics`);
	const diagCollection = vscode.languages.createDiagnosticCollection('vortex');
	context.subscriptions.push(diagCollection);

	Logger.debug(`Registering document listeners`);
	const saveListener = vscode.workspace.onDidSaveTextDocument(async doc => {
		const requiredFiles = await getRequiredFilesForWorkspace();
		for (const requiredFile of requiredFiles) {
			if (path.basename(doc.fileName) === requiredFile.fileName) {
				requiredFile.validateFunc?.(requiredFile.requiredFields, doc, diagCollection);
			}
		}
	});

	const openListener = vscode.workspace.onDidOpenTextDocument(async doc => {
		const requiredFiles = await getRequiredFilesForWorkspace();
		for (const requiredFile of requiredFiles) {
			if (path.basename(doc.fileName) === requiredFile.fileName) {
				requiredFile.validateFunc?.(requiredFile.requiredFields, doc, diagCollection);
			}
		}
	});

	context.subscriptions.push(saveListener, openListener);

	Logger.debug(`Vortex workspace features activated`);
}

async function newGameSupportExtensionLocal(context: vscode.ExtensionContext) {
	Logger.debug(`Starting new game extension command`);
	try {
		await newGameSupportExtension(context);
		Logger.debug(`New game extension command completed`);
	}
	catch (err) {
		Logger.error(`Error during new game extension command: ${String(err)}`);
		vscode.window.showErrorMessage(`Error during new game extension command: ${String(err)}`);
	}
}

async function runWorkspaceChecksLocal() {
	Logger.debug(`Running workspace checks`);
	const rootUri = await getWorkspaceRootUri();
	const requiredFiles = await getRequiredFilesForWorkspace(rootUri);
	Logger.debug(`Found ${requiredFiles.length} required files to check`);

	const problems: string[] = [];

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Running workspace checks',
			cancellable: false
		},
		async (progress) => {
			for (const requiredFile of requiredFiles) {
				if (requiredFile.skipInWorkspaceChecks) {
					Logger.debug(`Skipping workspace check for ${requiredFile.fileName}`);
					continue;
				}

				Logger.debug(`Checking required file ${requiredFile.fileName}`);
				progress.report({ message: `Checking ${requiredFile.fileName}...` });

				const fileUri = vscode.Uri.joinPath(rootUri, requiredFile.fileName);
				if (!(await fileExists(fileUri))) {
					problems.push(`${requiredFile.fileName} is missing from the workspace root.`);
					continue;
				}

				if (requiredFile.requiredFields.length !== 0) {
					const content = await vscode.workspace.fs.readFile(fileUri);
					try {
						const json = JSON.parse(content.toString());
						for (const field of requiredFile.requiredFields) {
							if (!json[field]) {
								problems.push(`${requiredFile.fileName} is missing required field "${field}".`);
							}
						}
					} catch {
						problems.push(`${requiredFile.fileName} is not valid JSON.`);
					}
				}
			}
		}
	);

	if (problems.length === 0) {
		Logger.debug(`Workspace checks passed`);
		vscode.window.showInformationMessage('Vortex workspace checks passed ✔');
	} else {
		Logger.warn(`Workspace checks found issues:\n` + problems.join('\n'));
		vscode.window.showWarningMessage('Vortex workspace checks found issues:\n' + problems.join('\n'));
	}
}

async function setupVortexApiLocal() {
	Logger.debug(`Setting up Vortex API`);
	const rootUri = await getWorkspaceRootUri();

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Setting up game extension',
			cancellable: false
		},
		async (progress) => {
			progress.report({ message: 'Installing dependencies...' });
			try {
				await runInstallDeps(rootUri);
			} catch (err) {
				Logger.error(`Failed to install dependencies: ${String(err)}`);
				vscode.window.showErrorMessage(`Failed to install dependencies: ${String(err)}`);
				return;
			}
		}
	);

	Logger.debug(`Vortex API setup completed`);
	vscode.window.showInformationMessage('Vortex API setup completed.');
}

async function scaffoldGameExtensionLocal() {
	Logger.debug(`Scaffolding missing files`);
	const rootUri = await getWorkspaceRootUri();
	const requiredFiles = await getRequiredFilesForWorkspace(rootUri);
	Logger.debug(`Found ${requiredFiles.length} required files to scaffold`);

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Setting up game extension',
			cancellable: false
		},
		async (progress) => {
			progress.report({ message: 'Creating missing files...' });
			try {
				await scaffoldGameExtension(requiredFiles, rootUri);
			} catch (err) {
				Logger.error(`Failed to create missing files: ${String(err)}`);
				vscode.window.showErrorMessage(`Failed to create missing files: ${String(err)}`);
				return;
			}
		}
	);

	Logger.debug(`Missing files created`);
	vscode.window.showInformationMessage('Missing files created.');
}

async function openDocumentationLocal() {
	await vscode.env.openExternal(vscode.Uri.parse(MISCELLANEOUS.NEXUS_DOCS_URL));
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}
