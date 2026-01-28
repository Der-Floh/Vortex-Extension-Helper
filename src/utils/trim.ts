function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function trimEndChars(str: string, chars: string): string {
    const pattern = new RegExp(`[${escapeRegex(chars)}]+$`, "g");
    return str.replace(pattern, "");
};

export function trimStartChars(str: string, chars: string): string {
    const pattern = new RegExp(`^[${escapeRegex(chars)}]+`, "g");
    return str.replace(pattern, "");
};

export function trimChars(str: string, chars: string): string {
    const esc = escapeRegex(chars);
    const pattern = new RegExp(`^[${esc}]+|[${esc}]+$`, "g");
    return str.replace(pattern, "");
};
