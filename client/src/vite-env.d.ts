/// <reference types="vite/client" />

/**
 * Augments Vite's built-in ImportMetaEnv with this project's own env vars,
 * via TypeScript's standard interface-merging (this adds to the interface
 * vite/client.d.ts declares, it doesn't replace it) — so `import.meta.env`
 * is both recognized at all and precisely typed for VITE_API_URL specifically,
 * instead of falling back to the generic `any`-valued index signature.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
