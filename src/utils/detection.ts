import type { ProjectLanguage } from '../types/project';
import { isRecord } from './jsonUtils';

export interface LanguageMarkers {
    readonly indexTs: boolean;
    readonly indexJs: boolean;
    readonly tsconfig: boolean;
    readonly jsconfig: boolean;
}

/** A Vortex game extension declares vortex-api as a devDependency */
export function isVortexManifest(manifest: unknown): boolean {
    return isRecord(manifest)
        && isRecord(manifest.devDependencies)
        && typeof manifest.devDependencies['vortex-api'] === 'string';
}

export function detectLanguage(markers: LanguageMarkers): ProjectLanguage {
    if (markers.indexTs) {
        return 'typescript';
    }
    if (markers.indexJs) {
        return 'javascript';
    }
    return markers.jsconfig && !markers.tsconfig ? 'javascript' : 'typescript';
}
