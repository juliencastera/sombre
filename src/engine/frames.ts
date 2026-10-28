/**
 * The browser paints an iframe's canvas opaque when the color scheme of the
 * frame's root differs from the one its `<iframe>` element uses in the
 * embedding page. A frame Sombre darkens inside a page it leaves alone (a
 * native-dark site, a never-site) must therefore take its parent's scheme on
 * its root, or a transparent overlay drawn over a video (Twitch extensions)
 * becomes an opaque veil. Cross-origin frames cannot read their parent's
 * styles, so they ask its content script.
 */
export type Scheme = 'light' | 'dark';

const ASK = 'sombre:scheme?';
const TELL = 'sombre:scheme';

/** The scheme an element is rendered with, from its computed `color-scheme`. */
export function usedScheme(value: string, osDark: boolean): Scheme {
  const tokens = value.split(/\s+/);
  return tokens.includes('dark') && (osDark || !tokens.includes('light')) ? 'dark' : 'light';
}

const frameElements = () => [...document.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame')];

/**
 * Answer child frames asking for their element's scheme. Returns a function
 * that tells every frame that asked again, after this page's scheme changed.
 */
export function serveFrames(osDark: () => boolean): () => void {
  const asked = new WeakSet<Window>();
  const tell = (frame: HTMLIFrameElement | HTMLFrameElement) => {
    const scheme = usedScheme(getComputedStyle(frame).colorScheme, osDark());
    frame.contentWindow?.postMessage({ type: TELL, scheme }, '*');
  };
  addEventListener('message', (event) => {
    if ((event.data as { type?: unknown } | null)?.type !== ASK) return;
    const frame = frameElements().find((el) => el.contentWindow === event.source);
    if (!frame?.contentWindow) return;
    asked.add(frame.contentWindow);
    tell(frame);
  });
  return () => {
    for (const frame of frameElements()) if (frame.contentWindow && asked.has(frame.contentWindow)) tell(frame);
  };
}

/** In a frame: ask the parent which scheme our element uses; `onScheme` gets every answer. */
export function askParent(onScheme: (scheme: Scheme) => void): void {
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const data = event.data as { type?: unknown; scheme?: unknown } | null;
    if (data?.type === TELL && (data.scheme === 'light' || data.scheme === 'dark')) onScheme(data.scheme);
  });
  parent.postMessage({ type: ASK }, '*');
}
