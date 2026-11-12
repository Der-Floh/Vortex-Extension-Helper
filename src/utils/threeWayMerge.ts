/** Lines `start` to `end` of the base, which one side replaced by `lines`; an insertion has `start === end` */
export interface Hunk {
    readonly start: number;
    readonly end: number;
    readonly lines: readonly string[];
}

export interface MergeLabels {
    /** Names the lines that are there now, after `<<<<<<<` */
    readonly ours: string;
    /** Names the lines the change brings, after `>>>>>>>` */
    readonly theirs: string;
}

/** A region both sides changed differently */
export interface Clash {
    readonly base: readonly string[];
    readonly ours: readonly string[];
    readonly theirs: readonly string[];
}

/** Settles a clash, or returns undefined to leave it to conflict markers */
export type ClashResolver = (clash: Clash) => readonly string[] | undefined;

export interface MergedLines {
    readonly lines: readonly string[];
    readonly conflicts: number;
}

export interface MergedText {
    readonly text: string;
    readonly conflicts: number;
}

export const CONFLICT_START = '<<<<<<<';
export const CONFLICT_SEPARATOR = '=======';
export const CONFLICT_END = '>>>>>>>';

interface SideHunk extends Hunk {
    readonly side: 'ours' | 'theirs';
}

type LinePair = readonly [number, number];

/**
 * Merges two changes of the same text the way git does. What only one side changed is taken from that side;
 * an insertion next to a change of the other side doesn't clash with it; lines both sides inserted at the same
 * place are both kept, `theirs` first; anything else both changed is settled by `resolve` or marked as a conflict.
 * The text keeps the line endings of `ours`.
 */
export function mergeTexts(base: string, ours: string, theirs: string, labels: MergeLabels, resolve?: ClashResolver): MergedText {
    const merged = mergeLines(linesOf(base), linesOf(ours), linesOf(theirs), labels, resolve);
    return { text: merged.lines.join(lineEndingOf(ours)), conflicts: merged.conflicts };
}

/** {@link mergeTexts} on lines */
export function mergeLines(base: readonly string[], ours: readonly string[], theirs: readonly string[], labels: MergeLabels, resolve?: ClashResolver): MergedLines {
    const hunks: SideHunk[] = [
        ...diffLines(base, ours).map(hunk => ({ ...hunk, side: 'ours' as const })),
        ...diffLines(base, theirs).map(hunk => ({ ...hunk, side: 'theirs' as const })),
    ].sort((left, right) => left.start - right.start || (left.end - left.start) - (right.end - right.start));
    const lines: string[] = [];
    let conflicts = 0;
    let position = 0;
    let index = 0;
    while (index < hunks.length) {
        const cluster = [hunks[index]];
        const start = hunks[index].start;
        let end = hunks[index].end;
        for (index++; index < hunks.length && clashes(hunks[index], start, end); index++) {
            cluster.push(hunks[index]);
            end = Math.max(end, hunks[index].end);
        }
        lines.push(...base.slice(position, start));
        const settled = settle(cluster, base, start, end, resolve);
        if (settled) {
            lines.push(...settled);
        } else {
            conflicts++;
            lines.push(...conflictBlock(rebuild(cluster.filter(hunk => hunk.side === 'ours'), base, start, end), rebuild(cluster.filter(hunk => hunk.side === 'theirs'), base, start, end), labels));
        }
        position = end;
    }
    lines.push(...base.slice(position));
    return { lines, conflicts };
}

/** The whole of `ours` against the whole of `theirs`, for a file both sides want differently */
export function wholeFileConflict(ours: string, theirs: string, labels: MergeLabels): string {
    const body = (text: string) => text === '' ? [] : linesOf(text.replace(/\r?\n$/, ''));
    return [...conflictBlock(body(ours), body(theirs), labels), ''].join(lineEndingOf(ours));
}

/** The changes from `before` to `after`, aligned on lines that occur once in both first, so braces and blank lines don't pair up across a file */
export function diffLines(before: readonly string[], after: readonly string[]): Hunk[] {
    const hunks: Hunk[] = [];
    let i = 0;
    let j = 0;
    for (const [matchedBefore, matchedAfter] of [...matchLines(before, after), [before.length, after.length] as const]) {
        if (matchedBefore > i || matchedAfter > j) {
            hunks.push({ start: i, end: matchedBefore, lines: after.slice(j, matchedAfter) });
        }
        i = matchedBefore + 1;
        j = matchedAfter + 1;
    }
    return hunks;
}

export function linesOf(text: string): string[] {
    return text.replace(/\r\n/g, '\n').split('\n');
}

export function lineEndingOf(text: string): string {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Whether a hunk overlaps the region, or inserts strictly inside it, or inserts where the region inserts */
function clashes(hunk: Hunk, start: number, end: number): boolean {
    if (start === end) {
        return hunk.start === start && hunk.end === start;
    }
    return hunk.start < end;
}

/** @returns The region's lines, or undefined for a conflict */
function settle(cluster: readonly SideHunk[], base: readonly string[], start: number, end: number, resolve?: ClashResolver): readonly string[] | undefined {
    const mine = cluster.filter(hunk => hunk.side === 'ours');
    const incoming = cluster.filter(hunk => hunk.side === 'theirs');
    if (incoming.length === 0 || mine.length === 0) {
        return rebuild(cluster, base, start, end);
    }
    const ours = rebuild(mine, base, start, end);
    const theirs = rebuild(incoming, base, start, end);
    if (sameLines(ours, theirs)) {
        return ours;
    }
    if (start === end) {
        return [...theirs, ...ours];
    }
    return resolve?.({ base: base.slice(start, end), ours, theirs });
}

/** One side's lines for the base region, from that side's hunks within it */
function rebuild(hunks: readonly Hunk[], base: readonly string[], start: number, end: number): string[] {
    const lines: string[] = [];
    let position = start;
    for (const hunk of hunks) {
        lines.push(...base.slice(position, hunk.start), ...hunk.lines);
        position = hunk.end;
    }
    lines.push(...base.slice(position, end));
    return lines;
}

function conflictBlock(ours: readonly string[], theirs: readonly string[], labels: MergeLabels): string[] {
    return [`${CONFLICT_START} ${labels.ours}`, ...ours, CONFLICT_SEPARATOR, ...theirs, `${CONFLICT_END} ${labels.theirs}`];
}

function matchLines(before: readonly string[], after: readonly string[]): LinePair[] {
    const pairs: LinePair[] = [];
    collectMatches(before, 0, before.length, after, 0, after.length, pairs);
    return pairs;
}

/** Patience diff: common ends, then the lines unique to both ranges as anchors, then the same between the anchors */
function collectMatches(a: readonly string[], aLow: number, aHigh: number, b: readonly string[], bLow: number, bHigh: number, pairs: LinePair[]): void {
    while (aLow < aHigh && bLow < bHigh && a[aLow] === b[bLow]) {
        pairs.push([aLow++, bLow++]);
    }
    const suffix: LinePair[] = [];
    while (aLow < aHigh && bLow < bHigh && a[aHigh - 1] === b[bHigh - 1]) {
        suffix.unshift([--aHigh, --bHigh]);
    }
    if (aLow < aHigh && bLow < bHigh) {
        const anchors = uniqueAnchors(a, aLow, aHigh, b, bLow, bHigh);
        if (anchors.length === 0) {
            pairs.push(...longestCommon(a, aLow, aHigh, b, bLow, bHigh));
        } else {
            let [nextA, nextB] = [aLow, bLow];
            for (const [i, j] of anchors) {
                collectMatches(a, nextA, i, b, nextB, j, pairs);
                pairs.push([i, j]);
                [nextA, nextB] = [i + 1, j + 1];
            }
            collectMatches(a, nextA, aHigh, b, nextB, bHigh, pairs);
        }
    }
    pairs.push(...suffix);
}

function uniqueAnchors(a: readonly string[], aLow: number, aHigh: number, b: readonly string[], bLow: number, bHigh: number): LinePair[] {
    const seen = new Map<string, { inA: number; inB: number; i: number; j: number }>();
    for (let i = aLow; i < aHigh; i++) {
        const entry = seen.get(a[i]) ?? { inA: 0, inB: 0, i, j: -1 };
        entry.inA++;
        seen.set(a[i], entry);
    }
    for (let j = bLow; j < bHigh; j++) {
        const entry = seen.get(b[j]);
        if (entry) {
            entry.inB++;
            entry.j = j;
        }
    }
    const candidates = [...seen.values()]
        .filter(entry => entry.inA === 1 && entry.inB === 1)
        .map(entry => [entry.i, entry.j] as const)
        .sort((left, right) => left[0] - right[0]);
    return longestIncreasing(candidates);
}

/** The longest run of pairs whose second numbers increase too, by patience sorting */
function longestIncreasing(pairs: readonly LinePair[]): LinePair[] {
    const tails: number[] = [];
    const previous: number[] = [];
    pairs.forEach(([, j], index) => {
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (pairs[tails[middle]][1] < j) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        previous[index] = low > 0 ? tails[low - 1] : -1;
        tails[low] = index;
    });
    const result: LinePair[] = [];
    for (let index = tails.length > 0 ? tails[tails.length - 1] : -1; index >= 0; index = previous[index]) {
        result.unshift(pairs[index]);
    }
    return result;
}

/** A longest common subsequence, for a stretch without lines unique to both sides */
function longestCommon(a: readonly string[], aLow: number, aHigh: number, b: readonly string[], bLow: number, bHigh: number): LinePair[] {
    const rows = aHigh - aLow;
    const columns = bHigh - bLow;
    const table = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1));
    for (let i = rows - 1; i >= 0; i--) {
        for (let j = columns - 1; j >= 0; j--) {
            table[i][j] = a[aLow + i] === b[bLow + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    const pairs: LinePair[] = [];
    for (let i = 0, j = 0; i < rows && j < columns;) {
        if (a[aLow + i] === b[bLow + j]) {
            pairs.push([aLow + i++, bLow + j++]);
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return pairs;
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((line, index) => line === right[index]);
}
