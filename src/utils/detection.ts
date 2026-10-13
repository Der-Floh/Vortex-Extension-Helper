import { isRecord } from './jsonUtils';

/** A Vortex game extension declares vortex-api as a devDependency */
export function isVortexManifest(manifest: unknown): boolean {
    return isRecord(manifest)
        && isRecord(manifest.devDependencies)
        && typeof manifest.devDependencies['vortex-api'] === 'string';
}
