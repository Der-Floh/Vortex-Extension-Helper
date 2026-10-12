export interface Snippet {
    /** Snippet syntax: `${1:name}` tab stops, `$0` for the final cursor */
    readonly body: string;
    readonly description: string;
}

export type SnippetMap = Readonly<Record<string, Snippet>>;
