import { useCallback, useRef } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';

interface ClipPlayerProps {
  youtubeVideoId: string;
  startSec: number;
  endSec: number;
  autoplay?: boolean;
}

export default function ClipPlayer({ youtubeVideoId, startSec, endSec, autoplay = true }: ClipPlayerProps) {
  const playerRef = useRef<any>(null);

  const handleReady: YouTubeProps['onReady'] = useCallback(
    (event) => {
      playerRef.current = event.target;
      event.target.loadVideoById({
        videoId: youtubeVideoId,
        startSeconds: startSec,
        endSeconds: endSec
      });
    },
    [youtubeVideoId, startSec, endSec]
  );

  const handleStateChange: YouTubeProps['onStateChange'] = useCallback(
    (event) => {
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
