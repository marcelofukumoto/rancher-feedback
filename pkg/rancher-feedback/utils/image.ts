import type { Screenshot } from '../types/feedback';

/**
 * `canvas.toDataURL()` returns `data:image/jpeg;base64,AAAA…`, but the CRD stores raw
 * base64 so that `kubectl get … | base64 -d` yields the file directly.
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');

  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** The inverse: rebuild a displayable data URL from a stored screenshot. */
export function toDataUrl(shot: Pick<Screenshot, 'contentType' | 'data'>): string {
  return `data:${ shot.contentType };base64,${ shot.data }`;
}

/**
 * Approximate decoded size of a base64 payload. Only used for human-readable hints, so
 * padding characters are not worth accounting for.
 */
export function base64SizeKb(data: string): number {
  return Math.round(((data?.length || 0) * 0.75) / 1024);
}
