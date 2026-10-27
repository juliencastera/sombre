import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const locale = (name: string) =>
  JSON.parse(readFileSync(path.join(root, 'public/_locales', name, 'messages.json'), 'utf8')) as Record<
    string,
    { message: string; placeholders?: Record<string, unknown> }
  >;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? sourceFiles(file) : /\.(ts|svelte)$/.test(name) ? [file] : [];
  });
}

describe('translations', () => {
  const en = locale('en');
  const fr = locale('fr');

  it('has the same keys and placeholders in every locale', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(Object.keys(fr[key]!.placeholders ?? {}), key).toEqual(Object.keys(en[key]!.placeholders ?? {}));
    }
  });

  it('defines every key the UI asks for', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(path.join(root, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('(\w+)'/g)) used.add(match[1]!);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((key) => !(key in en))).toEqual([]);
  });
});
