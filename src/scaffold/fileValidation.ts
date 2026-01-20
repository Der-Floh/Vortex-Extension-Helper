import * as vscode from 'vscode';

export function validateInfoJson(requiredFields: string[], document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
    const diagnostics: vscode.Diagnostic[] = [];
    try {
        const json = JSON.parse(document.getText());
        for (const field of requiredFields) {
            if (!json[field]) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 1),
                    `Missing required field "${field}" in info.json`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(diag);
            }
        }
    } catch (err) {
        // const diag = new vscode.Diagnostic(
        //     new vscode.Range(0, 0, 0, 1),
        //     'info.json is not valid JSON',
        //     vscode.DiagnosticSeverity.Error
        // );
        // diagnostics.push(diag);
    }

    collection.set(document.uri, diagnostics);
}
