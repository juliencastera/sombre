/**
 * Validate and sign the shared fix list.
 *
 *   node scripts/sign-fixes.ts [private-key-path]
 *
 * Reads fixes/fixes.json, rejects it if anything does not pass the extension's
 * own validator, and writes the signed list to fixes/fixes.signed.json (served
 * to installed extensions) and public/fixes.signed.json (bundled fallback).
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFixList, type SignedFixList } from '../src/shared/fixes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privatePath = process.argv[2] ?? path.join(homedir(), '.sombre', 'fixes-ed25519.pem');

const source = JSON.parse(readFileSync(path.join(ROOT, 'fixes/fixes.json'), 'utf8'));
const list = validateFixList(source);
if (!list) throw new Error('fixes/fixes.json: invalid list (needs a non-negative integer "version" and "sites")');

const dropped = Object.entries(source.sites ?? {}).reduce(
  (count, [key, fixes]) => count + ((fixes as unknown[]).length - (list.sites[key]?.length ?? 0)),
  0,
);
if (dropped) throw new Error(`fixes/fixes.json: ${dropped} fix(es) fail validation; fix them before signing`);

const payload = JSON.stringify(list);
const signature = sign(null, Buffer.from(payload), createPrivateKey(readFileSync(privatePath))).toString('base64');
const signed: SignedFixList = { payload, signature };
const text = `${JSON.stringify(signed, null, 2)}\n`;
writeFileSync(path.join(ROOT, 'fixes/fixes.signed.json'), text);
writeFileSync(path.join(ROOT, 'public/fixes.signed.json'), text);
console.log(`Signed version ${list.version}: ${Object.keys(list.sites).length} site(s)`);
