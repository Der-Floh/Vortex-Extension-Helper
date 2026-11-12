import { createHash } from 'crypto';
import * as nativeFs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';
import { pipeline } from 'stream/promises';
import { HTTP } from './constants';

/** A finished download. */
export interface DownloadedFile {
    /** Number of bytes written. */
    bytes: number;
    /** SHA-256 of the written bytes, as lowercase hex. */
    sha256: string;
}

/**
 * Requests a JSON document over HTTPS, following redirects.
 *
 * @param url - URL of the document.
 * @param accept - Value of the `Accept` header.
 * @returns A promise resolving to the parsed document.
 */
export async function getJson<T>(url: string, accept: string): Promise<T> {
    const response = await request(url, { Accept: accept }, HTTP.maxRedirects);
    return JSON.parse(await readText(response)) as T;
}

/**
 * Downloads a file over HTTPS, following redirects, and hashes it on the way.
 *
 * @param url - URL of the file.
 * @param destination - Absolute path the file is written to.
 * @param onProgress - Called with the progress in whole percent whenever it changes, if the size is known.
 * @returns A promise resolving to the size and SHA-256 of the written file.
 */
export async function downloadFile(url: string, destination: string, onProgress?: (percent: number) => void): Promise<DownloadedFile> {
    const response = await request(url, {}, HTTP.maxRedirects);
    const reportProgress = progressReporter(Number(response.headers['content-length'] ?? 0), onProgress);
    const hash = createHash('sha256');
    let bytes = 0;

    await pipeline(
        response,
        async function* (chunks: AsyncIterable<Buffer>) {
            for await (const chunk of chunks) {
                hash.update(chunk);
                bytes += chunk.length;
                reportProgress(bytes);
                yield chunk;
            }
        },
        nativeFs.createWriteStream(destination),
    );

    return { bytes, sha256: hash.digest('hex') };
}

/**
 * Sends a GET request and resolves with the first successful response,
 * following up to `redirectsLeft` redirects.
 *
 * @param url - URL to request.
 * @param headers - Extra request headers.
 * @param redirectsLeft - How many more redirects may be followed.
 * @returns A promise resolving to the response, whose body hasn't been read yet.
 */
function request(url: string, headers: Record<string, string>, redirectsLeft: number): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': HTTP.userAgent, ...headers }, timeout: HTTP.timeoutMs }, (response) => {
            const status = response.statusCode ?? 0;
            const location = response.headers.location;
            if (HTTP.redirectStatuses.includes(status) && location !== undefined) {
                response.resume();
                if (redirectsLeft <= 0) {
                    reject(new Error(`Too many redirects requesting ${url}`));
                    return;
                }
                resolve(request(new URL(location, url).toString(), headers, redirectsLeft - 1));
                return;
            }
            if (status !== HTTP.okStatus) {
                response.resume();
                reject(new Error(failureMessage(response, url)));
                return;
            }
            resolve(response);
        });
        req.on('timeout', () => req.destroy(new Error(`Timed out requesting ${url}`)));
        req.on('error', reject);
    });
}

/**
 * Describes a failed response, pointing out GitHub's rate limit when it was hit.
 *
 * @param response - The failed response.
 * @param url - The requested URL.
 * @returns The error message.
 */
function failureMessage(response: IncomingMessage, url: string): string {
    const status = response.statusCode ?? 0;
    const rateLimited = HTTP.rateLimitStatuses.includes(status) && response.headers[HTTP.rateLimitRemainingHeader] === '0';
    return rateLimited
        ? `GitHub's rate limit for ${url} was reached (HTTP ${status}). Please try again later.`
        : `HTTP ${status} requesting ${url}`;
}

/**
 * Reads a response body as UTF-8 text.
 *
 * @param response - The response to read.
 * @returns A promise resolving to the body.
 */
async function readText(response: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of response) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Creates a callback that turns byte counts into whole-percent progress and
 * only forwards changes.
 *
 * @param totalBytes - Expected size; 0 if unknown, which disables reporting.
 * @param onProgress - Receives the progress in percent.
 * @returns The callback to call with the number of bytes received so far.
 */
function progressReporter(totalBytes: number, onProgress?: (percent: number) => void): (bytes: number) => void {
    let lastPercent = -1;
    return (bytes) => {
        if (onProgress === undefined || totalBytes <= 0) {
            return;
        }
        const percent = Math.floor((bytes / totalBytes) * 100);
        if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress(percent);
        }
    };
}
