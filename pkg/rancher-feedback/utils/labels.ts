const MAX_LABEL_LENGTH = 63;

/**
 * Kubernetes label values must be at most 63 characters of alphanumerics, `-`, `_` or
 * `.`, and must start and end with an alphanumeric. Cluster ids and product names are
 * usually already safe; usernames from an external auth provider are not.
 *
 * Returns an empty string when nothing usable survives, which callers should treat as
 * "do not set this label" rather than setting it empty.
 */
export function labelSafe(value: string): string {
  return (value || '')
    .replace(/[^A-Za-z0-9\-_.]/g, '-')
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9]+$/, '');
}

/** `fb-20260710-a1b2c3`: chronologically sortable, collision-resistant enough for this. */
export function generateFeedbackName(now: Date = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');

  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');

  return `fb-${ stamp }-${ random }`;
}
