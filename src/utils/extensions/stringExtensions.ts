export { };

declare global {
    interface String {
        trimEndChars(chars: string): string;
        trimStartChars(chars: string): string;
        trimChars(chars: string): string;
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

String.prototype.trimEndChars = function (chars: string): string {
    const pattern = new RegExp(`[${escapeRegex(chars)}]+$`, "g");
    return this.replace(pattern, "");
};

String.prototype.trimStartChars = function (chars: string): string {
    const pattern = new RegExp(`^[${escapeRegex(chars)}]+`, "g");
    return this.replace(pattern, "");
};

String.prototype.trimChars = function (chars: string): string {
    const esc = escapeRegex(chars);
    const pattern = new RegExp(`^[${esc}]+|[${esc}]+$`, "g");
    return this.replace(pattern, "");
};
