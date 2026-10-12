import { findNodeAtLocation, getNodeValue, parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';

export interface ParsedJson {
    readonly root?: Node;
    readonly errors: readonly ParseError[];
}

/** Parses strict JSON as npm reads it: comments and trailing commas are errors */
export function parseStrictJson(text: string): ParsedJson {
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true });
    return { root, errors };
}

/** Parses JSON leniently, returning whatever could be read, or undefined */
export function parseLenientJson(text: string): unknown {
    const root = parseTree(text, [], { allowTrailingComma: true });
    return root ? getNodeValue(root) : undefined;
}

export function describeParseError(error: ParseError): string {
    return printParseErrorCode(error.error);
}

export function nodeAt(root: Node | undefined, path: readonly (string | number)[]): Node | undefined {
    return root ? findNodeAtLocation(root, [...path]) : undefined;
}

export function stringAt(root: Node | undefined, path: readonly (string | number)[]): string | undefined {
    const node = nodeAt(root, path);
    return node?.type === 'string' ? node.value as string : undefined;
}

/** The key node of a property, for anchoring a finding on the property name */
export function keyNodeAt(root: Node | undefined, path: readonly (string | number)[]): Node | undefined {
    const valueNode = nodeAt(root, path);
    return valueNode?.parent?.type === 'property' ? valueNode.parent.children?.[0] : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Converts a character offset into a zero-based line and character */
export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
    let line = 0;
    let lineStart = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            lineStart = i + 1;
        }
    }
    return { line, character: Math.min(offset, text.length) - lineStart };
}
