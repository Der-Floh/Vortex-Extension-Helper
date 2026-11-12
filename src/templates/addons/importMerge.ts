import type { Clash } from '../../utils/threeWayMerge';

interface ImportDeclaration {
    readonly typeOnly: boolean;
    readonly names: readonly string[];
    readonly quote: string;
    readonly module: string;
}

const NAMED_IMPORT = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]+)\3;\s*$/;

/**
 * Settles a clash made only of single-line named imports per module: the names the change adds to or
 * removes from a module are applied to the project's declaration of it, and a module that is new to both
 * goes in at its sorted place. Anything else is left to conflict markers.
 */
export function mergeImportClash(clash: Clash): readonly string[] | undefined {
    const [base, ours, theirs] = [clash.base, clash.ours, clash.theirs].map(parseImports);
    if (!base || !ours || !theirs) {
        return undefined;
    }
    const namesIn = (declarations: readonly ImportDeclaration[], declaration: ImportDeclaration) =>
        declarations.find(candidate => sameModule(candidate, declaration))?.names ?? [];
    const merged: ImportDeclaration[] = ours.map(declaration => {
        const before = namesIn(base, declaration);
        const after = namesIn(theirs, declaration);
        const removed = before.filter(name => !after.includes(name));
        const added = after.filter(name => !before.includes(name) && !declaration.names.includes(name));
        return { ...declaration, names: [...declaration.names.filter(name => !removed.includes(name)), ...added] };
    }).filter(declaration => declaration.names.length > 0);
    for (const declaration of theirs.filter(candidate => ![...base, ...ours].some(other => sameModule(other, candidate)))) {
        const index = merged.findIndex(other => other.module > declaration.module);
        merged.splice(index < 0 ? merged.length : index, 0, declaration);
    }
    return merged.map(formatImport);
}

function parseImports(lines: readonly string[]): ImportDeclaration[] | undefined {
    const declarations: ImportDeclaration[] = [];
    for (const line of lines) {
        const match = NAMED_IMPORT.exec(line);
        if (!match) {
            return undefined;
        }
        const names = match[2].split(',').map(name => name.trim()).filter(name => name.length > 0);
        declarations.push({ typeOnly: match[1] !== undefined, names, quote: match[3], module: match[4] });
    }
    return declarations;
}

function sameModule(left: ImportDeclaration, right: ImportDeclaration): boolean {
    return left.module === right.module && left.typeOnly === right.typeOnly;
}

function formatImport({ typeOnly, names, quote, module }: ImportDeclaration): string {
    return `import ${typeOnly ? 'type ' : ''}{ ${names.join(', ')} } from ${quote}${module}${quote};`;
}
