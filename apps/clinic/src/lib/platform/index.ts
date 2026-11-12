type Platform = "tauri" | "web";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const currentPlatform = (): Platform => {
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined) {
    return "tauri";
  }
  return "web";
}

export const isTauri = (): boolean => {
  return currentPlatform() === "tauri";
}

/** Android/iOS WebView user agents; the desktop web build is never "mobile"
 * for adapter purposes even on a narrow viewport. */
const MOBILE_UA = /Android|iPhone|iPad|iPod/i

/**
 * True only inside the Tauri shell on a phone or tablet. The mobile shell has
 * no Go sidecar (an APK cannot spawn one), so callers use this to skip sidecar
 * discovery instead of polling a loopback port that can never answer.
 */
export const isMobilePlatform = (): boolean => {
  if (!isTauri() || typeof navigator === "undefined") return false
  return MOBILE_UA.test(navigator.userAgent)
}
