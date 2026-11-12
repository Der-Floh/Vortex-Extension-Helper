/** Makes text match itself literally inside a regular expression */
export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
