export type Platform = "tauri" | "web";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const currentPlatform = (): Platform => {
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined) {
    return "tauri";
  }
  return "web";
}

export const isTauri = (): boolean => {
  return currentPlatform() === "tauri";
}
