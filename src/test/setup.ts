import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom has no Web Locks; model the browser's exclusive lock and reset storage per test.
import { beforeEach } from 'vitest';
import { createTestLocks } from './locks';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, 'locks', {configurable: true, value: createTestLocks()});
  Object.defineProperty(navigator, 'onLine', {configurable: true, value: true});
});
