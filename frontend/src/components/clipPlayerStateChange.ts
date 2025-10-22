import type { YouTubeProps } from 'react-youtube';

export type YouTubeStateChangeEvent = Parameters<NonNullable<YouTubeProps['onStateChange']>>[0];

export interface HandleStateChangeOptions {
  startSec: number;
  endSec?: number;
  shouldLoop?: boolean;
  playing?: boolean;
  onEnded?: () => void;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const didClipEnd = (eventData: number): boolean => {
  const endedState = typeof window !== 'undefined' ? window.YT?.PlayerState?.ENDED : undefined;
  return eventData === 0 || eventData === endedState;
};

export const createHandleStateChangeHandler = ({
  startSec,
  endSec,
  shouldLoop = true,
  playing,
  onEnded
}: HandleStateChangeOptions): NonNullable<YouTubeProps['onStateChange']> => {
  return (event: YouTubeStateChangeEvent) => {
    if (!didClipEnd(event.data)) {
      return;
    }

    if (shouldLoop && isFiniteNumber(endSec)) {
      event.target.seekTo(startSec, true);
      if (typeof playing === 'boolean') {
        if (playing) {
          event.target.playVideo();
        } else {
          event.target.pauseVideo();
        }
      }
      return;
    }

    onEnded?.();
  };
};

export const __testables = { didClipEnd };
