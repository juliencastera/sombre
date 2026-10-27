/**
 * `make help`: list the Makefile targets documented with `## `, grouped under
 * `##@ ` headings. Node rather than awk/grep so it runs from cmd, PowerShell or sh.
 */
import { readFileSync } from 'node:fs';

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type Entry = { heading: string } | { target: string; text: string };

const lines = readFileSync(process.argv[2] ?? 'Makefile', 'utf8').split(/\r?\n/);
const entries = lines.flatMap((line): Entry[] => {
  const heading = /^##@\s+(.*)$/.exec(line);
  if (heading) return [{ heading: heading[1]! }];
  const target = /^([a-zA-Z0-9_-]+):[^#]*##\s+(.*)$/.exec(line);
  return target ? [{ target: target[1]!, text: target[2]! }] : [];
});
const width = Math.max(...entries.map((entry) => ('target' in entry ? entry.target.length : 0)));

console.log(`\n${BOLD}Usage:${RESET} make ${CYAN}<target>${RESET} ${DIM}[VAR=value ...]${RESET}`);
for (const entry of entries) {
  if ('heading' in entry) console.log(`\n${BOLD}${entry.heading}${RESET}`);
  else console.log(`  ${CYAN}${entry.target.padEnd(width)}${RESET}  ${entry.text}`);
}
console.log();
