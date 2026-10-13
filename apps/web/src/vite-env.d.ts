/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (default) or "http". */
  readonly VITE_GAME_SERVER?: string;
  /** Base URL of the game server when VITE_GAME_SERVER=http. */
  readonly VITE_API_URL?: string;
  /** Mock only: "none" (default) or "flaky" to inject network failures. */
  readonly VITE_MOCK_FAULTS?: string;
  /** Per-request timeout in ms (default 3000). */
  readonly VITE_SERVER_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
