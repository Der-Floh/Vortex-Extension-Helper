declare module '*?text' {
    const content: string;
    export default content;
}

declare module '*.jpg' {
    const content: Uint8Array;
    export default content;
}

/** The add-ons below `src/templates/files/src`, inlined by the plugin in `esbuild.addons.mjs` */
declare module 'virtual:template-addons' {
    const catalogue: { readonly addons: readonly import('../templates/addons/addon').Addon[] };
    export default catalogue;
}
