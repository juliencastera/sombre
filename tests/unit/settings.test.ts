import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  findSiteKey,
  normalizeSettings,
  resolveEffective,
  siteKey,
  sitePatterns,
  toggleSite,
  type Settings,
} from '../../src/shared/settings.ts';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('site keys', () => {
  it('strips www and normalizes case', () => {
    expect(siteKey('WWW.Example.com')).toBe('example.com');
  });

  it('matches the most specific key, including parent domains', () => {
    expect(findSiteKey(['example.com', 'mail.example.com'], 'mail.example.com')).toBe('mail.example.com');
    expect(findSiteKey(['example.com'], 'docs.example.com')).toBe('example.com');
    expect(findSiteKey(['example.com'], 'notexample.com')).toBeUndefined();
  });

  it('builds match patterns for host and subdomains', () => {
    expect(sitePatterns('example.com')).toEqual(['*://example.com/*', '*://*.example.com/*']);
    expect(sitePatterns('[::1]')).toEqual([]);
  });
});

describe('resolveEffective', () => {
  it('follows the OS in auto mode', () => {
    expect(resolveEffective(settings(), 'a.com', true)).toEqual({ on: true, reason: 'auto-dark' });
    expect(resolveEffective(settings(), 'a.com', false)).toEqual({ on: false, reason: 'auto-light' });
  });

  it('lets site exceptions win over the default', () => {
    const s = settings({ mode: 'dark', sites: { 'a.com': 'never' } });
    expect(resolveEffective(s, 'www.a.com', true)).toEqual({ on: false, reason: 'site-never' });
    expect(resolveEffective(s, 'b.com', true)).toEqual({ on: true, reason: 'mode-dark' });
  });
});

describe('toggleSite', () => {
  it('creates an exception opposite to the default', () => {
    expect(toggleSite(settings(), 'a.com', true).sites).toEqual({ 'a.com': 'never' });
    expect(toggleSite(settings(), 'a.com', false).sites).toEqual({ 'a.com': 'dark' });
  });

  it('removes the exception when toggling back', () => {
    const once = toggleSite(settings(), 'a.com', true);
    expect(toggleSite(once, 'a.com', true).sites).toEqual({});
  });

  it('keeps a parent domain exception and overrides it for the subdomain only', () => {
    const s = settings({ sites: { 'a.com': 'never' } });
    expect(toggleSite(s, 'docs.a.com', true).sites).toEqual({ 'a.com': 'never', 'docs.a.com': 'dark' });
  });
});

describe('normalizeSettings', () => {
  it('drops invalid values and fills defaults', () => {
    expect(normalizeSettings({ mode: 'nope', sites: { 'a.com': 'dark', 'b.com': 'x' } })).toEqual({
      mode: 'auto',
      sites: { 'a.com': 'dark' },
    });
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
