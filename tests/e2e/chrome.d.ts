/** Extension APIs used by functions evaluated in the extension's service worker during E2E tests. */
declare const chrome: {
  scripting: { getRegisteredContentScripts(): Promise<unknown[]> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored values are read with ad-hoc shapes
  storage: { local: { get(key: string | null): Promise<Record<string, any>>; set(items: object): Promise<void> } };
  tabs: {
    query(info: object): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown, options?: object): Promise<unknown>;
  };
};
