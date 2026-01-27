import * as vscode from 'vscode';

export { };

declare module 'vscode' {
    namespace Uri {
        function getFolderPath(uri: Uri): Uri;
    }
}

vscode.Uri.getFolderPath = function (uri: vscode.Uri): vscode.Uri {
    const segments = uri.path.split('/');
    segments.pop();
    const folderPath = segments.join('/') || '/';
    return uri.with({ path: folderPath });
};
