import { GML, GML_RELEASE, HTTP } from './constants';
import { getJson } from './http';

/** The Godot Mod Loader release asset the extension installs. */
export interface GmlAsset {
    name: string;
    size: number;
    url: string;
    /** SHA-256 as lowercase hex, if GitHub provides a digest for the asset. */
    sha256?: string;
}

/** A Godot Mod Loader release, reduced to the asset the extension installs. */
export interface GmlRelease {
    tag: string;
    asset: GmlAsset;
}

/** The fields of GitHub's release asset JSON this extension reads. */
interface GithubAsset {
    name: string;
    size: number;
    browser_download_url: string;
    digest?: string | null;
}

/** The fields of GitHub's release JSON this extension reads. */
interface GithubRelease {
    tag_name: string;
    assets?: GithubAsset[];
}

/**
 * Looks up the Godot Mod Loader release on GitHub.
 *
 * @returns A promise resolving to the release and its asset.
 */
export async function fetchGmlRelease(): Promise<GmlRelease> {
    const release = await getJson<GithubRelease>(GML_RELEASE.apiUrl, HTTP.acceptGithubJson);
    return { tag: release.tag_name, asset: toGmlAsset(findAsset(release)) };
}

/**
 * Picks the asset from a release.
 *
 * @param release - The release JSON.
 * @returns The asset.
 */
function findAsset(release: GithubRelease): GithubAsset {
    const asset = release.assets?.find(candidate => candidate.name === GML_RELEASE.assetName);
    if (asset === undefined) {
        throw new Error(`${GML.name} release ${release.tag_name} has no "${GML_RELEASE.assetName}".`);
    }
    return asset;
}

/**
 * Converts GitHub's asset JSON.
 *
 * @param asset - The asset JSON.
 * @returns The asset.
 */
function toGmlAsset(asset: GithubAsset): GmlAsset {
    return {
        name: asset.name,
        size: asset.size,
        url: asset.browser_download_url,
        sha256: sha256FromDigest(asset.digest),
    };
}

/**
 * Reads the SHA-256 from a GitHub asset digest such as `sha256:8d36…`.
 *
 * @param digest - The digest, if GitHub provides one.
 * @returns The hash as lowercase hex, or undefined for other or missing digests.
 */
function sha256FromDigest(digest: string | null | undefined): string | undefined {
    if (!digest?.startsWith(GML_RELEASE.digestPrefix)) {
        return undefined;
    }
    return digest.slice(GML_RELEASE.digestPrefix.length).toLowerCase();
}
