import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { YouTubePlayer } from 'react-youtube';

const ClipPlayer = lazy(() => import('./ClipPlayer'));

export type PlaybackRepeatMode = 'off' | 'one' | 'all';

export interface PlaylistBarItem {
  itemId: number;
  key: string;
  type: 'video' | 'clip';
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  youtubeVideoId: string | null;
  startSec: number;
  endSec?: number | null;
  durationLabel: string | null;
  isPlayable: boolean;
  badgeLabel?: string | null;
  rangeLabel?: string | null;
}

interface PlaylistBarProps {
  items: PlaylistBarItem[];
  queueItems?: PlaylistBarItem[];
  currentItemKey: string | null;
  currentIndex: number;
  className?: string;
  playbackActivationNonce: number;
  isPlaying: boolean;
  isExpanded: boolean;
  isMobileViewport: boolean;
  showQueueToggle: boolean;
  canCreatePlaylist: boolean;
  canModifyPlaylist: boolean;
  playlistSearchQuery: string;
  onPlaylistSearchChange: (query: string) => void;
  onCreatePlaylist: () => void | Promise<unknown>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  repeatMode: PlaybackRepeatMode;
  onRepeatModeChange: (mode: PlaybackRepeatMode) => void;
  onToggleExpanded: () => void;
  onSelectItem: (key: string) => void;
  onRemoveItem: (itemId: number) => void | Promise<unknown>;
  onTrackEnded: () => void;
  onPlayerInstanceChange?: (player: YouTubePlayer | null) => void;
}

const getLoopIcon = (mode: PlaybackRepeatMode) => {
  if (mode === 'one') return '🔂';
  if (mode === 'all') return '🔁';
  return '🔁';
};

export default function PlaylistBar({
  items,
  queueItems,
  currentItemKey,
  currentIndex,
  className,
  playbackActivationNonce,
  isPlaying,
  isExpanded,
  isMobileViewport,
  showQueueToggle,
  repeatMode,
  onRepeatModeChange,
  onToggleExpanded,
  onPlayPause,
  onNext,
  onPrevious,
  onSelectItem,
  onRemoveItem,
  onTrackEnded,
  onPlayerInstanceChange
}: PlaylistBarProps) {
  const [hasActivatedPlayback, setHasActivatedPlayback] = useState(false);
  const internalPlayerRef = useRef<YouTubePlayer | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const currentItem = useMemo(
    () => items.find((item) => item.key === currentItemKey) ?? null,
    [items, currentItemKey]
  );

  const visibleQueueItems = useMemo(() => queueItems ?? items, [items, queueItems]);
  const hasPlayableItems = visibleQueueItems.some((item) => item.isPlayable);

  useEffect(() => {
    if (isPlaying && !hasActivatedPlayback) {
      setHasActivatedPlayback(true);
    }
  }, [hasActivatedPlayback, isPlaying]);

  useEffect(() => {
    if (items.length === 0) {
      setHasActivatedPlayback(false);
    }
  }, [items.length]);

  const handleRepeatToggle = useCallback(() => {
    if (!hasPlayableItems) return;
    const nextMode: PlaybackRepeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    onRepeatModeChange(nextMode);
  }, [hasPlayableItems, onRepeatModeChange, repeatMode]);

  const handlePlayerReady = useCallback(
    (player: YouTubePlayer | null) => {
      internalPlayerRef.current = player;
      onPlayerInstanceChange?.(player);
    },
    [onPlayerInstanceChange]
  );

  useEffect(() => {
    if (!isPlaying || isDragging) return;

    const timer = window.setInterval(() => {
      const player = internalPlayerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        const current = player.getCurrentTime();
        const total = player.getDuration();
        if (total > 0) {
          setProgress((current / total) * 100);
        }
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [isPlaying, isDragging]);

  useEffect(() => {
    setProgress(0);
  }, [currentItemKey]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const player = internalPlayerRef.current;
    if (!player) return;

    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(Math.max(x / rect.width, 0), 1);

    const duration = player.getDuration();
    if (duration > 0) {
      player.seekTo(duration * percentage, true);
      setProgress(percentage * 100);
    }
  };

  const clipPlayerContent = useMemo(() => {
    if (!currentItem || !currentItem.isPlayable || !currentItem.youtubeVideoId) {
      return null;
    }

    if (!isPlaying && !hasActivatedPlayback) {
      return null;
    }

    return (
      <Suspense
        fallback={
          <div className="playlist-bar__player-loading" role="status" aria-live="polite">
            플레이어 준비 중…
          </div>
        }
      >
        <ClipPlayer
          key={playbackActivationNonce}
          youtubeVideoId={currentItem.youtubeVideoId}
          startSec={currentItem.startSec}
          endSec={typeof currentItem.endSec === 'number' ? currentItem.endSec : undefined}
          autoplay={isPlaying}
          playing={isPlaying}
          shouldLoop={repeatMode === 'one'}
          onEnded={onTrackEnded}
          activationNonce={playbackActivationNonce}
          onPlayerInstanceChange={handlePlayerReady}
        />
      </Suspense>
    );
  }, [
    currentItem,
    hasActivatedPlayback,
    isPlaying,
    onTrackEnded,
    playbackActivationNonce,
    repeatMode,
    handlePlayerReady
  ]);

  if (!currentItem) {
    return null;
  }

  const repeatActive = repeatMode !== 'off';
  const playlistBarClassName = `playlist-bar${className ? ` ${className}` : ''}`;

  return (
    <>
      <div className="playlist-hidden-player" aria-hidden="true">
        {clipPlayerContent}
      </div>

      <div className={playlistBarClassName} role="contentinfo" aria-label="재생 컨트롤">
        <div
          className="progress-container-wrapper"
          onClick={handleSeek}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          role="slider"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="재생 위치 변경"
        >
          <div
            className="progress-bar"
            style={{ width: `${progress}%`, transition: isDragging ? 'none' : 'width 0.2s linear' }}
          />
        </div>

        <div className="playlist-bar-content">
          <div className="pb-left">
            <img
              src={
                currentItem.thumbnailUrl ||
                (currentItem.youtubeVideoId
                  ? `https://img.youtube.com/vi/${currentItem.youtubeVideoId}/default.jpg`
                  : undefined)
              }
              className="pb-thumbnail"
              alt="Album Art"
            />
            <div className="pb-info">
              <div className="pb-title">{currentItem.title}</div>
              <div className="pb-artist">{currentItem.subtitle ?? '동영상'}</div>
            </div>
            <div className="pb-actions" aria-hidden>
              <button className="icon-btn thumbs-btn" type="button">
                👍
              </button>
              <button className="icon-btn thumbs-btn" type="button">
                👎
              </button>
            </div>
          </div>

          <div className="pb-center" aria-label="재생 컨트롤 그룹">
            <button className="icon-btn" type="button" onClick={onPrevious} aria-label="이전 곡">
              ⏮
            </button>
            <button className="circle-play-btn" type="button" onClick={onPlayPause} aria-label="재생/일시정지">
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="icon-btn" type="button" onClick={onNext} aria-label="다음 곡">
              ⏭
            </button>
            <button
              className={`icon-btn loop-btn${repeatActive ? ' active' : ''}`}
              type="button"
              onClick={handleRepeatToggle}
              aria-label="반복 재생"
            >
              {getLoopIcon(repeatMode)}
            </button>
          </div>

          <div className="pb-right">
            <div className="volume-control">
              <span style={{ fontSize: '18px' }}>🔊</span>
              <input
                type="range"
                min="0"
                max="100"
                className="volume-slider"
                onChange={(e) => internalPlayerRef.current?.setVolume(Number(e.target.value))}
              />
            </div>
            {showQueueToggle && (
              <button
                className="queue-toggle-btn"
                type="button"
                onClick={onToggleExpanded}
                aria-label={isExpanded ? '재생목록 닫기' : '재생목록 열기'}
              >
                다음 트랙 {isExpanded ? '🔽' : '🔼'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="playlist-drawer" role="complementary" aria-label="재생 목록">
          <div className="drawer-header">
            <div>
              <h3>다음 트랙</h3>
              <div className="drawer-tabs">
                <button className="active" type="button">
                  다음 트랙
                </button>
                <button type="button" disabled>
                  가사
                </button>
                <button type="button" disabled>
                  관련 항목
                </button>
              </div>
            </div>
            <button className="close-drawer-btn" type="button" onClick={onToggleExpanded} aria-label="재생목록 닫기">
              ✕
            </button>
          </div>

          <div className="drawer-content">
            {visibleQueueItems.length === 0 ? (
              <div className="empty-msg">재생목록이 비어있습니다.</div>
            ) : (
              visibleQueueItems.map((item, index) => {
                const isActive = currentItemKey === item.key;
                return (
                  <div
                    key={`${item.key}-${index}`}
                    className={`compact-item${isActive ? ' active' : ''}`}
                    onClick={() => onSelectItem(item.key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectItem(item.key);
                      }
                    }}
                  >
                    <div className="ci-left">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} className="ci-thumb" alt="" />
                      ) : (
                        <div className="ci-thumb ci-thumb--placeholder">No image</div>
                      )}
                      {isActive && <div className="playing-overlay">📊</div>}
                    </div>
                    <div className="ci-info">
                      <div className="ci-title">{item.title}</div>
                      <div className="ci-artist">{item.subtitle ?? '동영상'}</div>
                    </div>
                    <div className="ci-right">
                      <span className="ci-duration">{item.durationLabel ?? '—'}</span>
                      <button
                        className="ci-remove"
                        type="button"
                        aria-label={`${item.title} 제거`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveItem(item.itemId);
                        }}
                        disabled={!repeatActive && !hasPlayableItems}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
