import * as path from 'path';
import * as vscode from 'vscode';
import { BUILTIN_OPEN, VORTEX_LOG_FILE } from '../constants';
import { vortexUserDataFolder } from '../debug/vortexInstall';
import { fileExists } from '../utils/fileSystemUtils';
import { showInfo } from '../utils/notifications';

export async function handleOpenVortexLog(): Promise<void> {
    const userData = vortexUserDataFolder(process.platform, process.env);
    const log = userData === undefined ? undefined : vscode.Uri.file(path.join(userData, VORTEX_LOG_FILE));
    if (log === undefined || !await fileExists(log)) {
        showInfo('Vortex hasn\'t written a log on this machine yet.');
        return;
    }
    await vscode.commands.executeCommand(BUILTIN_OPEN, log);
}
