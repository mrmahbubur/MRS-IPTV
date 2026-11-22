import { Channel } from '../types';

export interface PlayerAdapterState {
  muted: boolean;
  volume: number;
  paused: boolean;
  readyState: number;
  playing: boolean;
}

export interface PlayerAdapter {
  setSource: (channel: Channel, resolvedSrc: string) => void;
  play: () => Promise<'playing' | 'autoplay-blocked' | 'error'>;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  getState: () => PlayerAdapterState;
}

/**
 * Strips signed URLs / token query params before displaying or logging errors.
 */
export function sanitizeClientPlaybackError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || 'Stream temporarily unavailable');
  return msg
    .replace(/https?:\/\/[^\s"'<>]+/gi, '')
    .replace(/([?&])(token|sig|signature|key|expires|auth|url)=[^&\s]+/gi, '')
    .trim() || 'Stream temporarily unavailable';
}
