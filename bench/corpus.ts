import { FIXTURE_ORIGIN } from './config.ts';

export type SiteKind =
  /** Local static page reproducing one spec §6 hard case. */
  | 'fixture'
  /** Real site that ships its own dark theme (exercises native detection). */
  | 'native-dark'
  /** Real site without a dark theme (exercises the engine). */
  | 'engine';

export interface Site {
  id: string;
  url: string;
  kind: SiteKind;
  /** Requires a logged-in test account (see `npm run bench:record -- --login`). */
  auth?: boolean;
  /** Time to wait after `load` before measuring. */
  settleMs?: number;
}

const fixture = (id: string): Site => ({
  id: `fixture-${id}`,
  url: `${FIXTURE_ORIGIN}/${id}.html`,
  kind: 'fixture',
  settleMs: 1500,
});

export const CORPUS: Site[] = [
  fixture('basic'),
  fixture('cross-origin-css'),
  fixture('inline-styles'),
  fixture('dynamic-style'),
  fixture('css-in-js'),
  fixture('shadow-dom'),
  fixture('iframe'),
  fixture('native-dark'),
  fixture('low-contrast'),
  fixture('heavy'),
  fixture('legacy-attributes'),
  fixture('utility-css'),
  fixture('mail-list'),
  fixture('accents'),

  { id: 'gmail', url: 'https://mail.google.com/mail/u/0/#inbox', kind: 'native-dark', auth: true },
  { id: 'notion', url: 'https://www.notion.so/', kind: 'native-dark', auth: true },
  { id: 'youtube', url: 'https://www.youtube.com/', kind: 'native-dark' },
  { id: 'github', url: 'https://github.com/darkreader/darkreader', kind: 'native-dark' },
  { id: 'gitlab', url: 'https://gitlab.com/gitlab-org/gitlab', kind: 'native-dark' },
  { id: 'reddit', url: 'https://www.reddit.com/r/programming/', kind: 'native-dark' },

  { id: 'leboncoin', url: 'https://www.leboncoin.fr/', kind: 'engine' },
  { id: 'amazon', url: 'https://www.amazon.fr/', kind: 'engine' },
  { id: 'hackernews', url: 'https://news.ycombinator.com/', kind: 'engine' },
  { id: 'lemonde', url: 'https://www.lemonde.fr/', kind: 'engine' },
  { id: 'doctolib', url: 'https://www.doctolib.fr/', kind: 'engine' },
  { id: 'ameli', url: 'https://www.ameli.fr/', kind: 'engine' },
  { id: 'impots', url: 'https://www.impots.gouv.fr/accueil', kind: 'engine' },
  { id: 'wikipedia', url: 'https://fr.wikipedia.org/wiki/Mode_sombre', kind: 'engine' },
  { id: 'shopify-allbirds', url: 'https://www.allbirds.com/', kind: 'engine' },
  { id: 'wordpress-news', url: 'https://wordpress.org/news/', kind: 'engine' },
];

/** Resolve a `--sites` filter: `all`, `fixtures`, `real`, or a comma-separated id list. */
export function selectSites(filter: string): Site[] {
  if (filter === 'all') return CORPUS;
  if (filter === 'fixtures') return CORPUS.filter((site) => site.kind === 'fixture');
  if (filter === 'real') return CORPUS.filter((site) => site.kind !== 'fixture');
  const ids = new Set(filter.split(',').map((id) => id.trim()));
  const sites = CORPUS.filter((site) => ids.has(site.id));
  const unknown = [...ids].filter((id) => !sites.some((site) => site.id === id));
  if (unknown.length) throw new Error(`Unknown site id(s): ${unknown.join(', ')}`);
  return sites;
}
