import { generateFeedbackName, labelSafe } from '../labels';

describe('labelSafe', () => {
  it('passes through an already-valid value', () => {
    expect(labelSafe('local')).toBe('local');
    expect(labelSafe('explorer')).toBe('explorer');
  });

  it('replaces disallowed characters with a dash', () => {
    expect(labelSafe('user@example.com')).toBe('user-example.com');
  });

  it('trims leading and trailing non-alphanumerics', () => {
    // A dash or dot at either end is invalid in a k8s label value.
    expect(labelSafe('-leading')).toBe('leading');
    expect(labelSafe('trailing.')).toBe('trailing');
    expect(labelSafe('_both_')).toBe('both');
  });

  it('truncates to 63 characters and re-trims the new tail', () => {
    const result = labelSafe('a'.repeat(80));

    expect(result.length).toBe(63);
    expect(result).toMatch(/^[A-Za-z0-9]/);
    expect(result).toMatch(/[A-Za-z0-9]$/);
  });

  it('returns empty when nothing usable survives', () => {
    expect(labelSafe('@@@')).toBe('');
    expect(labelSafe('')).toBe('');
  });
});

describe('generateFeedbackName', () => {
  it('encodes the UTC date and is DNS-label-shaped', () => {
    const name = generateFeedbackName(new Date('2026-07-10T18:04:11Z'));

    expect(name).toMatch(/^fb-20260710-[a-z0-9]{6}$/);
  });

  it('uses UTC, not local time, near a day boundary', () => {
    // 23:30 UTC on the 10th must not roll to the 11th regardless of the runner's zone.
    const name = generateFeedbackName(new Date('2026-07-10T23:30:00Z'));

    expect(name.startsWith('fb-20260710-')).toBe(true);
  });

  it('is a valid RFC 1123 subdomain (safe as a metadata.name)', () => {
    expect(generateFeedbackName()).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  });
});
