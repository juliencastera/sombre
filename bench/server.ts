import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { FIXTURE_PORTS, PATHS } from './config.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Self-signed certificate for the fixture servers (the browser runs with certificate errors ignored). */
async function ensureCertificate(): Promise<{ key: Buffer; cert: Buffer }> {
  const key = path.join(PATHS.tls, 'key.pem');
  const cert = path.join(PATHS.tls, 'cert.pem');
  const present = await access(cert).then(
    () => true,
    () => false,
  );
  if (!present) {
    await mkdir(PATHS.tls, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=sombre-bench',
    ], { stdio: 'ignore' });
  }
  return { key: await readFile(key), cert: await readFile(cert) };
}

async function resolveFile(roots: string[], urlPath: string): Promise<string | null> {
  const relative = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  for (const root of roots) {
    const file = path.join(root, relative);
    if (!file.startsWith(root)) continue;
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return file;
  }
  return null;
}

function serve(roots: string[], port: number, tls: { key: Buffer; cert: Buffer }): Promise<https.Server> {
  const server = https.createServer(tls, async (req, res) => {
    const urlPath = new URL(req.url ?? '/', 'https://x').pathname;
    const file = await resolveFile(roots, urlPath);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    // No CORS headers on purpose: cross-origin stylesheets must stay opaque to the page.
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Start the fixture origin and the "CDN" origin. Returns a function that stops both. */
export async function startFixtureServers(): Promise<() => Promise<void>> {
  const tls = await ensureCertificate();
  const site = path.join(PATHS.fixtures, 'site');
  const cdn = path.join(PATHS.fixtures, 'cdn');
  const servers = await Promise.all([
    serve([site], FIXTURE_PORTS.site, tls),
    serve([cdn, site], FIXTURE_PORTS.cdn, tls),
  ]);
  return async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  };
}
