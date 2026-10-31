import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  findSiteKey,
  inSchedule,
  nextSwitch,
  normalizeNative,
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

describe('schedule', () => {
  const at = (h: number, m = 0, sec = 0) => new Date(2026, 9, 31, h, m, sec);
  const night = { from: 20 * 60, to: 7 * 60 };

  it('is dark between the two times, across midnight', () => {
    expect(inSchedule(night, at(19, 59))).toBe(false);
    expect(inSchedule(night, at(20))).toBe(true);
    expect(inSchedule(night, at(3))).toBe(true);
    expect(inSchedule(night, at(7))).toBe(false);
    expect(inSchedule({ from: 9 * 60, to: 17 * 60 }, at(12))).toBe(true);
    expect(inSchedule({ from: 9 * 60, to: 17 * 60 }, at(18))).toBe(false);
  });

  it('counts down to the next switch', () => {
    expect(nextSwitch(night, at(19, 59, 30))).toBe(30_000);
    expect(nextSwitch(night, at(20))).toBe(11 * 3_600_000);
    expect(nextSwitch(night, at(12))).toBe(8 * 3_600_000);
  });

  it('sets the default of every site', () => {
    const s = settings({ mode: 'schedule', schedule: night });
    expect(resolveEffective(s, 'a.com', false, at(22))).toEqual({ on: true, reason: 'schedule-dark' });
    expect(resolveEffective(s, 'a.com', true, at(12))).toEqual({ on: false, reason: 'schedule-light' });
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
      contrast: 'standard',
      tone: 'neutral',
      dimImages: false,
      sharedFixes: true,
      schedule: { from: 1200, to: 420 },
    });
    expect(normalizeSettings({ mode: 'schedule', schedule: { from: 1500, to: 60 } })).toMatchObject({
      mode: 'schedule',
      schedule: { from: 1200, to: 60 },
    });
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ contrast: 'high' }).contrast).toBe('high');
    expect(normalizeSettings({ contrast: 'max' }).contrast).toBe('standard');
    expect(normalizeSettings({ tone: 'sepia' }).tone).toBe('sepia');
    expect(normalizeSettings({ tone: 'pink' }).tone).toBe('neutral');
  });

  it('reads native verdicts, including the M1 timestamp format', () => {
    const marker = { target: 'html', kind: 'attr', name: 'dark', value: '' } as const;
    expect(normalizeNative({ 'a.com': 5, 'b.com': { at: 6, marker }, 'c.com': 'x' })).toEqual({
      'a.com': { at: 5 },
      'b.com': { at: 6, marker },
    });
  });
});
