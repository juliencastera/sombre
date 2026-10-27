import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixesFor, validateFix, validateFixList, verifyFixList } from '../../src/shared/fixes.ts';

describe('validateFix', () => {
  it('accepts the closed set of actions', () => {
    expect(validateFix({ selector: '.logo', action: 'invert' })).toEqual({ selector: '.logo', action: 'invert' });
    expect(validateFix({ selector: '#app', action: 'ignore' })).toEqual({ selector: '#app', action: 'ignore' });
    expect(validateFix({ selector: 'main > p:nth-of-type(2)', action: 'invert' })?.selector).toBe('main > p:nth-of-type(2)');
    expect(validateFix({ selector: '.x', action: 'set-color', property: 'color', value: '#ABCDEF' })).toEqual({
      selector: '.x',
      action: 'set-color',
      property: 'color',
      value: '#abcdef',
    });
  });

  it.each([
    [{ selector: '.x', action: 'css' }],
    [{ selector: '.x', action: 'set-color', property: 'background-image', value: '#fff' }],
    [{ selector: '.x', action: 'set-color', property: 'color', value: 'url(https://evil)' }],
    [{ selector: '.x', action: 'set-color', property: 'color', value: 'red' }],
    [{ selector: '.x{} body', action: 'invert' }],
    [{ selector: '@import "x"', action: 'invert' }],
    [{ selector: 'input[value^="a"]::after { content: url(x) }', action: 'invert' }],
    [{ selector: '.a\\7b', action: 'invert' }],
    [{ selector: '', action: 'invert' }],
    [{ selector: 'x'.repeat(301), action: 'invert' }],
    [null],
  ])('rejects %j', (fix) => {
    expect(validateFix(fix)).toBeNull();
  });
});

describe('validateFixList', () => {
  it('drops invalid sites and fixes, keeps the rest', () => {
    expect(
      validateFixList({
        version: 3,
        sites: { 'a.com': [{ selector: '.x', action: 'invert' }, { selector: '.y', action: 'nope' }], 'B C': [] },
      }),
    ).toEqual({ version: 3, sites: { 'a.com': [{ selector: '.x', action: 'invert' }] } });
  });

  it('requires an integer version', () => {
    expect(validateFixList({ version: '3', sites: {} })).toBeNull();
    expect(validateFixList({ version: -1, sites: {} })).toBeNull();
  });
});

describe('fixesFor', () => {
  it('collects fixes of the host and its parent domains', () => {
    const sites = { 'a.com': [{ selector: '.x', action: 'invert' as const }], 'docs.a.com': [{ selector: '.y', action: 'ignore' as const }] };
    expect(fixesFor(sites, 'www.docs.a.com').map((fix) => fix.selector).sort()).toEqual(['.x', '.y']);
    expect(fixesFor(sites, 'b.com')).toEqual([]);
  });
});

describe('verifyFixList', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
  const payload = JSON.stringify({ version: 7, sites: { 'a.com': [{ selector: '.x', action: 'invert' }] } });
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');

  it('accepts a list signed by the embedded key', async () => {
    expect(await verifyFixList({ payload, signature }, raw)).toEqual({
      version: 7,
      sites: { 'a.com': [{ selector: '.x', action: 'invert' }] },
    });
  });

  it('rejects a tampered payload', async () => {
    expect(await verifyFixList({ payload: payload.replace('7', '8'), signature }, raw)).toBeNull();
  });

  it('rejects a list signed by another key', async () => {
    const other = generateKeyPairSync('ed25519');
    const forged = sign(null, Buffer.from(payload), other.privateKey).toString('base64');
    expect(await verifyFixList({ payload, signature: forged }, raw)).toBeNull();
  });

  it('rejects anything without a key or malformed', async () => {
    expect(await verifyFixList({ payload, signature }, '')).toBeNull();
    expect(await verifyFixList({ payload }, raw)).toBeNull();
    expect(await verifyFixList('nope', raw)).toBeNull();
  });
});
