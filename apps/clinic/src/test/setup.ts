// React 19 requires this flag for act() outside a testing renderer.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Unit tests exercise code that reads translated labels (roleLabel,
// statusLabel…). Activating the source locale makes `i18n._` fall back to the
// message id (the English source text) instead of throwing.
if (typeof window !== "undefined") {
  void import("@lingui/core").then(({ i18n }) => i18n.activate("en"));
}

// jsdom does not always expose localStorage (depends on version/flags); the
// web persistence layer expects it, so provide a minimal in-memory shim.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  const shim: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
}
