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
  /** The port each frame sent with its question; every answer goes through it. */
  const asked = new WeakMap<Window, MessagePort>();
  const tell = (frame: HTMLIFrameElement | HTMLFrameElement, port: MessagePort) =>
    port.postMessage(usedScheme(getComputedStyle(frame).colorScheme, osDark()));
  addEventListener('message', (event) => {
    const port = event.ports[0];
    if ((event.data as { type?: unknown } | null)?.type !== ASK || !port) return;
    const frame = frameElements().find((el) => el.contentWindow === event.source);
    if (!frame?.contentWindow) return;
    asked.set(frame.contentWindow, port);
    tell(frame, port);
  });
  return () => {
    for (const frame of frameElements()) {
      const port = frame.contentWindow && asked.get(frame.contentWindow);
      if (port) tell(frame, port);
    }
  };
}

/**
 * In a frame: ask the parent which scheme our element uses; `onScheme` gets every answer.
 * Answers come through a private port: pages that relay messages between their parent
 * and their own frames (Twitch's extension supervisor) would otherwise hand a frame
 * the answer meant for its parent.
 */
export function askParent(onScheme: (scheme: Scheme) => void): void {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = (event) => {
    if (event.data === 'light' || event.data === 'dark') onScheme(event.data);
  };
  parent.postMessage({ type: ASK }, '*', [port2]);
}
