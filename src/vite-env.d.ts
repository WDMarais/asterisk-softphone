/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PBX SIP realm + proxy target host, e.g. "pbx.example.com". Required; no default. */
  readonly VITE_PBX_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
