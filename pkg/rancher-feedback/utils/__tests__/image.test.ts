import { base64SizeKb, stripDataUrlPrefix, toDataUrl } from '../image';

describe('stripDataUrlPrefix', () => {
  it('removes a data-URI prefix', () => {
    expect(stripDataUrlPrefix('data:image/jpeg;base64,AAAA')).toBe('AAAA');
  });

  it('leaves already-bare base64 untouched', () => {
    expect(stripDataUrlPrefix('AAAA')).toBe('AAAA');
  });

  it('round-trips with toDataUrl', () => {
    const dataUrl = 'data:image/png;base64,QUJD';
    const bare = stripDataUrlPrefix(dataUrl);

    expect(toDataUrl({ contentType: 'image/png', data: bare })).toBe(dataUrl);
  });
});

describe('toDataUrl', () => {
  it('builds a data URL from parts', () => {
    expect(toDataUrl({ contentType: 'image/jpeg', data: 'ZZZ' })).toBe('data:image/jpeg;base64,ZZZ');
  });
});

describe('base64SizeKb', () => {
  it('estimates decoded size at 3/4 of the base64 length', () => {
    // 4096 base64 chars ≈ 3072 bytes ≈ 3 KB.
    expect(base64SizeKb('a'.repeat(4096))).toBe(3);
  });

  it('is zero for empty input', () => {
    expect(base64SizeKb('')).toBe(0);
  });
});
