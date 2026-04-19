/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production site URL (see `.env.production`). */
  readonly VITE_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
