export interface Snippet {
    /** Snippet syntax: `${1:name}` tab stops, `$0` for the final cursor */
    readonly body: string;
    readonly description: string;
}

export type SnippetMap = Readonly<Record<string, Snippet>>;

/** What a sidebar row passes to the command that inserts a snippet */
export interface SnippetTarget {
    readonly snippet?: Snippet;
}
