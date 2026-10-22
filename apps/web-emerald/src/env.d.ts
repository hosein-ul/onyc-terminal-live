/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ONyc Terminal API; empty means same origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
