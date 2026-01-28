import * as vscode from 'vscode';

export function getFolderPath(uri: vscode.Uri): vscode.Uri {
    const segments = uri.path.split('/');
    segments.pop();
    const folderPath = segments.join('/') || '/';
    return uri.with({ path: folderPath });
};
