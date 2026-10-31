declare module '*.po' {
  export const messages: Record<string, string>
}

// Compiled lingui catalogs (lingui compile output) — same shape as *.po.
declare module '*.mjs' {
  export const messages: Record<string, string>
}
