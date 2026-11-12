import type { Severity } from '../types/project';

export interface GeneratedFileSpec {
    readonly path: string;
    readonly source: string | Uint8Array;
    /** Contains `{{key}}` placeholders or slots; other files are written byte for byte */
    readonly templated: boolean;
    /** Create Missing Files may write it; needs no values beyond `restoreValues` */
    readonly restorable: boolean;
    /** Severity reported when the file is missing */
    readonly required?: Severity;
    /** Part of the plain installer, so a project with a mod loader doesn't get it */
    readonly plainOnly?: boolean;
}

type SpecOptions = Partial<Pick<GeneratedFileSpec, 'templated' | 'restorable' | 'required' | 'plainOnly'>>;

export function spec(path: string, source: string | Uint8Array, options: SpecOptions = {}): GeneratedFileSpec {
    return Object.freeze({ path, source, templated: false, restorable: true, ...options });
}
