import { describe, expect, it } from 'vitest';
import { browserName, issueUrl } from '../../src/shared/report.ts';

describe('issueUrl', () => {
  const info = {
    hostname: 'example.com',
    version: '0.1.0',
    contrast: 'standard',
    state: 'Dark — global default',
    native: false,
    browser: 'Chrome/156.0.0.0',
  };

  it('opens a new issue on the repository with the page details', () => {
    const url = new URL(issueUrl('https://github.com/me/sombre/', info));
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/me/sombre/issues/new');
    expect(url.searchParams.get('title')).toBe('Site: example.com');
    expect(url.searchParams.get('labels')).toBe('site');
    const body = url.searchParams.get('body')!;
    for (const value of ['example.com', '0.1.0', 'standard', 'Dark — global default', 'Chrome/156.0.0.0']) {
      expect(body).toContain(value);
    }
  });
});

describe('browserName', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', 'Chrome/156.0.0.0'],
    ['Mozilla/5.0 Chrome/156.0.0.0 Safari/537.36 Edg/156.0.1.2', 'Edg/156.0.1.2'],
    ['curl/8', 'unknown'],
  ])('%s', (ua, expected) => expect(browserName(ua)).toBe(expected));
});
