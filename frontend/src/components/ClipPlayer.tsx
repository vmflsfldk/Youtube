import { useCallback, useEffect, useRef } from 'react';
import YouTube, { YouTubePlayer, YouTubeProps } from 'react-youtube';

interface ClipPlayerProps {
  youtubeVideoId: string;
  startSec: number;
  endSec?: number;
  autoplay?: boolean;
}

type YouTubeReadyEvent = Parameters<NonNullable<YouTubeProps['onReady']>>[0];
type YouTubeStateChangeEvent = Parameters<NonNullable<YouTubeProps['onStateChange']>>[0];

export default function ClipPlayer({ youtubeVideoId, startSec, endSec, autoplay = true }: ClipPlayerProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);

  const loadSegment = useCallback(
    (player: YouTubePlayer) => {
      const config: { videoId: string; startSeconds: number; endSeconds?: number } = {
        videoId: youtubeVideoId,
        startSeconds: startSec
      };
      if (typeof endSec === 'number' && Number.isFinite(endSec)) {
        config.endSeconds = endSec;
      }
      if (autoplay) {
        player.loadVideoById(config);
      } else {
        player.cueVideoById(config);
      }
    },
    [youtubeVideoId, startSec, endSec, autoplay]
  );

  const handleReady = useCallback<NonNullable<YouTubeProps['onReady']>>(
    (event: YouTubeReadyEvent) => {
      playerRef.current = event.target;
      loadSegment(event.target);
    },
    [loadSegment]
  );

  const handleStateChange = useCallback<NonNullable<YouTubeProps['onStateChange']>>(
    (event: YouTubeStateChangeEvent) => {
      if (typeof endSec === 'number' && Number.isFinite(endSec) && event.data === window.YT?.PlayerState?.ENDED) {
        event.target.seekTo(startSec, true);
      }
    },
    [startSec, endSec]
  );

  useEffect(() => {
    if (playerRef.current) {
      loadSegment(playerRef.current);
    }
  }, [loadSegment]);

  return (
    <YouTube
      videoId={youtubeVideoId}
      opts={{
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 1,
          start: startSec,
          ...(typeof endSec === 'number' && Number.isFinite(endSec) ? { end: endSec } : {})
        }
      }}
      onReady={handleReady}
      onStateChange={handleStateChange}
    />
  );
}
