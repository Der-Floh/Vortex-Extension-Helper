declare module '*?text' {
    const content: string;
    export default content;
}

declare module '*.jpg' {
    const content: Uint8Array;
    export default content;
}
