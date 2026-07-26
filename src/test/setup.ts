import "@testing-library/jest-dom";

// Work around a Node 22+ vs. jsdom conflict: Node defines its own
// experimental global `localStorage`/`sessionStorage` accessors, which take
// precedence over (and are not overridden by) vitest's jsdom environment
// globals. Without `--localstorage-file`, Node's accessor resolves to
// `undefined` instead of throwing, so any code touching `localStorage` in
// tests silently breaks. vitest's jsdom environment stashes the underlying
// JSDOM instance on `globalThis.jsdom`; re-point the globals at its real,
// working Storage implementations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsdomInstance = (globalThis as any).jsdom;
if (jsdomInstance?.window) {
  Object.defineProperty(globalThis, "localStorage", {
    value: jsdomInstance.window.localStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: jsdomInstance.window.sessionStorage,
    configurable: true,
    writable: true,
  });
}
