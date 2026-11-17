/** Dedicated channels: deliberately NOT part of shared/channels.ts recreation cleanup. */
export const desktopLyricsChannels = Object.freeze({
  publish: 'desktop-lyrics:v1:publish',
  mainState: 'desktop-lyrics:v1:main-state',
  mainPreferences: 'desktop-lyrics:v1:main-preferences',
  overlayState: 'desktop-lyrics:v1:overlay-state',
  overlayPreferences: 'desktop-lyrics:v1:overlay-preferences',
  overlayHide: 'desktop-lyrics:v1:overlay-hide',
  stateChanged: 'desktop-lyrics:v1:state-changed',
} as const);
export const DESKTOP_LYRICS_OVERLAY_ARGUMENT = '--desktop-lyrics-overlay';

export type DesktopLyricsTrack = { key: string; title: string; artist: string };
export type DesktopLyricsLine = {
  timeMs: number | null;
  text: string;
  translation?: string;
  /** Source-provided marks only. Their text must concatenate to the entire line. */
  segments?: { timeMs: number | null; text: string }[];
};
export type DesktopLyricsClock = { positionMs: number; playing: boolean; rate: number };
export type DesktopLyricsPublication = {
  /** Read from state(); main advances this on primary document reset. */
  epoch: number;
  /** The real player's monotonic Audio loadToken; zero is valid after reload. */
  generation: number;
  /** Strictly increasing within each generation, including seeks and clears. */
  sequence: number;
  track: DesktopLyricsTrack | null;
  clock: DesktopLyricsClock | null;
  current: DesktopLyricsLine | null;
  next: DesktopLyricsLine | null;
};
export type DesktopLyricsPreferences = {
  version: 1;
  visible: boolean;
  locked: boolean;
  fontSize: number;
  color: string;
  highlightColor: string;
  showTranslation: boolean;
  wordHighlight: boolean;
  /** Device-independent desktop pixels; null means centered near primary bottom. */
  position: { x: number; y: number } | null;
};
export type DesktopLyricsOverlayPatch = Partial<Pick<DesktopLyricsPreferences,
  'locked' | 'fontSize' | 'color' | 'highlightColor' | 'showTranslation' | 'wordHighlight'>>;
export type DesktopLyricsMainPatch = DesktopLyricsOverlayPatch & { visible?: boolean };
export type DesktopLyricsSnapshot = {
  epoch: number;
  generation: number | null;
  track: DesktopLyricsTrack | null;
  /** receivedAtMs is stamped in main, NEVER supplied by the publisher. */
  anchor: (DesktopLyricsClock & { receivedAtMs: number }) | null;
  current: DesktopLyricsLine | null;
  next: DesktopLyricsLine | null;
};
export type DesktopLyricsErrorCode = 'DENIED' | 'INVALID' | 'STALE' | 'RATE_LIMITED' | 'DISPOSED'
  | 'PERSISTENCE_READ_FAILED' | 'PERSISTENCE_WRITE_FAILED' | 'WINDOW_FAILED';
export type DesktopLyricsNotice = { code: DesktopLyricsErrorCode; message: string };
export type DesktopLyricsState = {
  snapshot: DesktopLyricsSnapshot;
  preferences: DesktopLyricsPreferences;
  /** Desired visibility is preferences.visible; shown is actual native visibility. */
  shown: boolean;
  persistence: 'saved' | 'pending' | 'error';
  notice: DesktopLyricsNotice | null;
};
export type DesktopLyricsResult<T = undefined> = { ok: true; data: T } | { ok: false; error: DesktopLyricsNotice };

/** Only the primary preload gets this capability. No media URLs/account fields. */
export type DesktopLyricsPublisherApi = {
  state(): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  publish(value: DesktopLyricsPublication): Promise<DesktopLyricsResult>;
  updatePreferences(patch: DesktopLyricsMainPatch): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  onState(listener: (state: DesktopLyricsState) => void): () => void;
};
/** This is the overlay's ENTIRE bridge, not the general application DesktopApi. */
export type DesktopLyricsOverlayApi = {
  state(): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  updatePreferences(patch: DesktopLyricsOverlayPatch): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  hide(): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  onState(listener: (state: DesktopLyricsState) => void): () => void;
};

declare global {
  interface Window { desktopLyrics?: DesktopLyricsOverlayApi }
}
