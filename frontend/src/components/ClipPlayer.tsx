import { useCallback, useRef } from 'react';
import YouTube, { YouTubePlayer, YouTubeProps } from 'react-youtube';

interface ClipPlayerProps {
  youtubeVideoId: string;
  startSec: number;
  endSec: number;
  autoplay?: boolean;
}

type YouTubeReadyEvent = Parameters<NonNullable<YouTubeProps['onReady']>>[0];
type YouTubeStateChangeEvent = Parameters<NonNullable<YouTubeProps['onStateChange']>>[0];

export default function ClipPlayer({ youtubeVideoId, startSec, endSec, autoplay = true }: ClipPlayerProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);

  const handleReady = useCallback<NonNullable<YouTubeProps['onReady']>>(
    (event: YouTubeReadyEvent) => {
      playerRef.current = event.target;
      event.target.loadVideoById({
        videoId: youtubeVideoId,
        startSeconds: startSec,
        endSeconds: endSec
      });
    },
    [youtubeVideoId, startSec, endSec]
  );

  const handleStateChange = useCallback<NonNullable<YouTubeProps['onStateChange']>>(
    (event: YouTubeStateChangeEvent) => {
      if (event.data === window.YT?.PlayerState?.ENDED) {
        event.target.seekTo(startSec, true);
      }
    },
    [startSec]
  );

  return (
    <YouTube
      videoId={youtubeVideoId}
      opts={{
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 1,
          start: startSec,
          end: endSec
        }
      }}
      onReady={handleReady}
      onStateChange={handleStateChange}
    />
  );
}
