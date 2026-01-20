import * as vscode from 'vscode';
import { validateInfoJson } from '../scaffold/fileValidation';
import { INFO_JSON } from './scaffoldFiles/infoJson';
import { GAMEART_JPG_BASE64 } from './scaffoldFiles/gameart';
import { IndexFile } from './scaffoldFiles/indexFile';
import { ConfigJson } from './scaffoldFiles/configJson';
import { PackageJson } from './scaffoldFiles/packageJson';

export interface IRequiredFile {
    fileName: string;
    requiredFields: string[];
    scaffoldContent?: string;
    validateFunc?: (requiredFields: string[], document: vscode.TextDocument, collection: vscode.DiagnosticCollection) => void;
}

export namespace RequiredFiles {
    export const INFO_JSON_NAME = 'info.json';
    export const GAMEART_JPG_NAME = 'gameart.jpg';
    export const INDEX_JS_NAME = 'index.js';
    export const INDEX_TS_NAME = 'index.ts';
    export const JSCONFIG_JSON_NAME = 'jsconfig.json';
    export const TSCONFIG_JSON_NAME = 'tsconfig.json';
    export const PACKAGE_JSON_NAME = 'package.json';

    export const COMMON: IRequiredFile[] = [
        {
            fileName: INFO_JSON_NAME,
            requiredFields: ['name', 'author', 'version', 'description'],
            scaffoldContent: INFO_JSON,
            validateFunc: validateInfoJson
        },
        {
            fileName: GAMEART_JPG_NAME,
            requiredFields: [],
            scaffoldContent: GAMEART_JPG_BASE64
        },
    ];

    export const JS: IRequiredFile[] = [
        ...COMMON,
        {
            fileName: INDEX_JS_NAME,
            requiredFields: [],
            scaffoldContent: IndexFile.JS,
        },
        {
            fileName: JSCONFIG_JSON_NAME,
            requiredFields: ['compilerOptions', 'include'],
            scaffoldContent: ConfigJson.JS
        },
        {
            fileName: PACKAGE_JSON_NAME,
            requiredFields: ['name', 'private', 'devDependencies', 'scripts'],
            scaffoldContent: PackageJson.JS
        },
    ];

    export const TS: IRequiredFile[] = [
        ...COMMON,
        {
            fileName: INDEX_TS_NAME,
            requiredFields: [],
            scaffoldContent: IndexFile.TS
        },
        {
            fileName: TSCONFIG_JSON_NAME,
            requiredFields: ['compilerOptions', 'include'],
            scaffoldContent: ConfigJson.TS
        },
        {
            fileName: PACKAGE_JSON_NAME,
            requiredFields: ['name', 'private', 'devDependencies', 'scripts'],
            scaffoldContent: PackageJson.TS
        },
    ];
}
