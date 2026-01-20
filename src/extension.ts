import * as vscode from 'vscode';
import * as path from 'path';

import './utils/extensions';

import { runInstallDeps } from './utils/shellUtils';
import { checkPendingScaffold, newGameSupportExtension, scaffoldGameExtension } from './scaffold/newGameExtension';
import { getRequiredFilesForWorkspace, getVortexCompletionProvider, getVortexWorkspaceType, getWorkspaceRootUri, isVortexWorkspaceType } from './workspace/vortexWorkspaceUtils';

export const EXTENSION_NAME = 'Vortex Helper';
export const EXTENSION_ID = 'vortexHelper';

export let log: vscode.LogOutputChannel;

export async function activate(context: vscode.ExtensionContext) {
	log = vscode.window.createOutputChannel(EXTENSION_NAME, { log: true });

	const workspaceType = await getVortexWorkspaceType();
	const isVortexWorkspace = isVortexWorkspaceType(workspaceType);
	log.debug(`${EXTENSION_NAME}: Detected workspace type: ${workspaceType}`);

	const newGameCmd = vscode.commands.registerCommand(`${EXTENSION_ID}.newGameSupportExtension`, async () => await newGameSupportExtensionLocal(context));
	context.subscriptions.push(newGameCmd);

	if (isVortexWorkspace) {
		await activateVortexWorkspace(context);
	}

	const scaffolded = await checkPendingScaffold(context);
	if (scaffolded) {
		const workspaceType = await getVortexWorkspaceType();
		const isVortexWorkspace = isVortexWorkspaceType(workspaceType);
		log.debug(`${EXTENSION_NAME}: Detected workspace type after scaffolding: ${workspaceType}`);
		if (isVortexWorkspace) {
			await activateVortexWorkspace(context);
		}
	}
}

export function deactivate() { }

async function activateVortexWorkspace(context: vscode.ExtensionContext) {
	log.debug(`${EXTENSION_NAME}: Activating Vortex workspace features`);

	log.debug(`${EXTENSION_NAME}: Registering commands`);
	const setupVortexApiCmd = vscode.commands.registerCommand(`${EXTENSION_ID}.setupVortexApi`, setupVortexApiLocal);
	const scaffoldCmd = vscode.commands.registerCommand(`${EXTENSION_ID}.scaffoldGameExtension`, scaffoldGameExtensionLocal);
	const checkCmd = vscode.commands.registerCommand(`${EXTENSION_ID}.runWorkspaceChecks`, runWorkspaceChecksLocal);
	context.subscriptions.push(setupVortexApiCmd, scaffoldCmd, checkCmd);

	// Register completion provider for JS
	const vortexCompletionProviderInfo = await getVortexCompletionProvider();
	log.debug(`${EXTENSION_NAME}: Registering completion provider for ${vortexCompletionProviderInfo?.language}`);
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

	log.debug(`${EXTENSION_NAME}: Setting up diagnostics`);
	const diagCollection = vscode.languages.createDiagnosticCollection('vortex');
	context.subscriptions.push(diagCollection);

	log.debug(`${EXTENSION_NAME}: Registering document listeners`);
	vscode.workspace.onDidSaveTextDocument(async doc => {
		const requiredFiles = await getRequiredFilesForWorkspace();
		for (const requiredFile of requiredFiles) {
			if (path.basename(doc.fileName) === requiredFile.fileName) {
				requiredFile.validateFunc?.(requiredFile.requiredFields, doc, diagCollection);
			}
		}
	});

	vscode.workspace.onDidOpenTextDocument(async doc => {
		const requiredFiles = await getRequiredFilesForWorkspace();
		for (const requiredFile of requiredFiles) {
			if (path.basename(doc.fileName) === requiredFile.fileName) {
				requiredFile.validateFunc?.(requiredFile.requiredFields, doc, diagCollection);
			}
		}
	});

	log.debug(`${EXTENSION_NAME}: Vortex workspace features activated`);
}

async function newGameSupportExtensionLocal(context: vscode.ExtensionContext) {
	log.debug(`${EXTENSION_NAME}: Starting new game extension scaffold command`);
	try {
		await newGameSupportExtension(context);
		log.debug(`${EXTENSION_NAME}: New game extension scaffold command completed`);
	}
	catch (err) {
		log.error(`${EXTENSION_NAME}: Error during new game extension scaffold command: ${String(err)}`);
		vscode.window.showErrorMessage(`Error during new game extension scaffold command: ${String(err)}`);
	}
}

async function runWorkspaceChecksLocal() {
	log.debug(`${EXTENSION_NAME}: Running workspace checks`);
	const rootUri = await getWorkspaceRootUri();
	const requiredFiles = await getRequiredFilesForWorkspace(rootUri);
	log.debug(`${EXTENSION_NAME}: Found ${requiredFiles.length} required files to check`);

	const problems: string[] = [];

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Running workspace checks',
			cancellable: false
		},
		async (progress) => {
			for (const requiredFile of requiredFiles) {
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
					} catch (err) {
						problems.push(`${requiredFile.fileName} is not valid JSON.`);
					}
				}
			}
		}
	);

	if (problems.length === 0) {
		log.debug(`${EXTENSION_NAME}: Workspace checks passed`);
		vscode.window.showInformationMessage('Vortex workspace checks passed ✔');
	} else {
		log.warn(`${EXTENSION_NAME}: Workspace checks found issues:\n` + problems.join('\n'));
		vscode.window.showWarningMessage('Vortex workspace checks found issues:\n' + problems.join('\n'));
	}
}

async function setupVortexApiLocal() {
	log.debug(`${EXTENSION_NAME}: Setting up Vortex API`);
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
				log.error(`${EXTENSION_NAME}: Failed to install dependencies: ${String(err)}`);
				vscode.window.showErrorMessage(`Failed to install dependencies: ${String(err)}`);
				return;
			}
		}
	);

	log.debug(`${EXTENSION_NAME}: Vortex API setup completed`);
	vscode.window.showInformationMessage('Vortex API setup completed.');
}

async function scaffoldGameExtensionLocal() {
	log.debug(`${EXTENSION_NAME}: Scaffolding missing files`);
	const rootUri = await getWorkspaceRootUri();
	const requiredFiles = await getRequiredFilesForWorkspace(rootUri);
	log.debug(`${EXTENSION_NAME}: Found ${requiredFiles.length} required files to scaffold`);

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
				log.error(`${EXTENSION_NAME}: Failed to create missing files: ${String(err)}`);
				vscode.window.showErrorMessage(`Failed to create missing files: ${String(err)}`);
				return;
			}
		}
	);

	log.debug(`${EXTENSION_NAME}: Missing files created`);
	vscode.window.showInformationMessage('Missing files created.');
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}
