import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { YouTubePlayer } from 'react-youtube';
import type { PlaybackRepeatMode, PlaylistBarItem } from './PlaylistBar';

const ClipPlayer = lazy(() => import('./ClipPlayer'));

interface PlaylistWidgetControlsProps {
  items: PlaylistBarItem[];
  currentItemKey: string | null;
  currentIndex: number;
  playbackActivationNonce: number;
  isPlaying: boolean;
  canCreatePlaylist: boolean;
  onCreatePlaylist: () => void | Promise<unknown>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  repeatMode: PlaybackRepeatMode;
  onRepeatModeChange: (mode: PlaybackRepeatMode) => void;
  onTrackEnded: () => void;
  onPlayerInstanceChange?: (player: YouTubePlayer | null) => void;
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="m8 5 13 7-13 7V5z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M5 5.5v13l9-6.5-9-6.5zm10 0h2v13h-2z" />
  </svg>
);

const PreviousIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M19 5.5v13l-9-6.5 9-6.5zm-10 0h-2v13h2z" />
  </svg>
);

const RepeatAllIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M17 5H7a4 4 0 0 0-4 4v3h2V9a2 2 0 0 1 2-2h10v3l4-4-4-4v3zm0 14H7v-3l-4 4 4 4v-3h10a4 4 0 0 0 4-4v-3h-2v3a2 2 0 0 1-2 2z"
    />
  </svg>
);

const RepeatOneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M17 5H7a4 4 0 0 0-4 4v3h2V9a2 2 0 0 1 2-2h10v3l4-4-4-4v3zm-4 12h2V11h-3v1h1v5zm4 2H7v-3l-4 4 4 4v-3h10a4 4 0 0 0 4-4v-3h-2v3a2 2 0 0 1-2 2z"
    />
  </svg>
);

export default function PlaylistWidgetControls({
  items,
  currentItemKey,
  currentIndex,
  playbackActivationNonce,
  isPlaying,
  canCreatePlaylist,
  onCreatePlaylist,
  onPlayPause,
  onNext,
  onPrevious,
  repeatMode,
  onRepeatModeChange,
  onTrackEnded,
  onPlayerInstanceChange
}: PlaylistWidgetControlsProps) {
  const [hasActivatedPlayback, setHasActivatedPlayback] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  const currentItem = useMemo(
    () => items.find((item) => item.key === currentItemKey) ?? null,
    [items, currentItemKey]
  );

  const hasPlayableItems = items.some((item) => item.isPlayable);
  const placeholderMessage = hasPlayableItems
    ? '재생할 항목을 선택하세요.'
    : '재생 가능한 항목이 없습니다.';

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

  const handleRepeatButtonClick = useCallback(
    (mode: PlaybackRepeatMode) => {
      if (!hasPlayableItems) {
        return;
      }
      if (repeatMode === mode) {
        onRepeatModeChange('off');
        return;
      }
      onRepeatModeChange(mode);
    },
    [hasPlayableItems, onRepeatModeChange, repeatMode]
  );

  const handleCreatePlaylistClick = useCallback(async () => {
    if (!canCreatePlaylist || isCreatingPlaylist) {
      return;
    }
    try {
      setIsCreatingPlaylist(true);
      await Promise.resolve(onCreatePlaylist());
    } catch (error) {
      console.error('Failed to create playlist from sidebar player', error);
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [canCreatePlaylist, isCreatingPlaylist, onCreatePlaylist]);

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
          <div className="playlist-widget__player-loading" role="status" aria-live="polite">
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
          onPlayerInstanceChange={onPlayerInstanceChange}
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
    onPlayerInstanceChange
  ]);

  const nowPlayingLabel = currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : `0/${items.length}`;
  const repeatAllActive = repeatMode === 'all';
  const repeatOneActive = repeatMode === 'one';
  const repeatAllLabel = repeatAllActive ? '전체 반복 끄기' : '전체 반복 켜기';
  const repeatOneLabel = repeatOneActive ? '한 곡 반복 끄기' : '한 곡 반복 켜기';

  return (
    <section className="playlist-widget__player" aria-label="재생 컨트롤">
      <div className="playlist-widget__player-frame" aria-live="polite">
        {clipPlayerContent ?? (
          <div className="playlist-widget__player-placeholder">{placeholderMessage}</div>
        )}
      </div>

      <div className="playlist-widget__now-playing">
        <div className="playlist-widget__label-row">
          <span className="playlist-widget__label">Now Playing</span>
          <span className="playlist-widget__counter">{nowPlayingLabel}</span>
        </div>
        <div className="playlist-widget__track">
          <div className="playlist-widget__thumbnail" aria-hidden={!currentItem?.thumbnailUrl}>
            {currentItem?.thumbnailUrl ? (
              <img src={currentItem.thumbnailUrl} alt="" />
            ) : (
              <span className="playlist-widget__thumbnail-placeholder">{placeholderMessage}</span>
            )}
          </div>
          <div className="playlist-widget__meta" aria-live="polite">
            <h4 className="playlist-widget__title">{currentItem?.title ?? '대기 중'}</h4>
            {currentItem?.subtitle && (
              <p className="playlist-widget__subtitle">{currentItem.subtitle}</p>
            )}
            {currentItem?.rangeLabel && (
              <p className="playlist-widget__range">{currentItem.rangeLabel}</p>
            )}
          </div>
        </div>
      </div>

      <div className="playlist-widget__controls" role="group" aria-label="재생 제어">
        <div className="playlist-widget__transport" role="group" aria-label="기본 재생 제어">
          <button
            type="button"
            className="playlist-widget__control-button"
            onClick={onPrevious}
            disabled={!hasPlayableItems}
            aria-label="이전 항목"
          >
            <PreviousIcon />
          </button>
          <button
            type="button"
            className="playlist-widget__control-button playlist-widget__control-button--primary"
            onClick={onPlayPause}
            disabled={!hasPlayableItems}
            aria-label={isPlaying ? '일시 정지' : '재생'}
          >
            {isPlaying && currentItem?.isPlayable ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="playlist-widget__control-button"
            onClick={onNext}
            disabled={!hasPlayableItems}
            aria-label="다음 항목"
          >
            <NextIcon />
          </button>
        </div>
        <div className="playlist-widget__repeat" role="group" aria-label="반복 모드">
          <button
            type="button"
            className={`playlist-widget__control-button playlist-widget__control-button--toggle${
              repeatAllActive ? ' is-active' : ''
            }`}
            onClick={() => handleRepeatButtonClick('all')}
            disabled={!hasPlayableItems}
            aria-pressed={repeatAllActive}
            aria-label={repeatAllLabel}
            title={repeatAllLabel}
          >
            <RepeatAllIcon />
          </button>
          <button
            type="button"
            className={`playlist-widget__control-button playlist-widget__control-button--toggle${
              repeatOneActive ? ' is-active' : ''
            }`}
            onClick={() => handleRepeatButtonClick('one')}
            disabled={!hasPlayableItems}
            aria-pressed={repeatOneActive}
            aria-label={repeatOneLabel}
            title={repeatOneLabel}
          >
            <RepeatOneIcon />
          </button>
        </div>
        {canCreatePlaylist && (
          <button
            type="button"
            className="playlist-widget__save"
            onClick={() => void handleCreatePlaylistClick()}
            disabled={isCreatingPlaylist || !hasPlayableItems}
          >
            {isCreatingPlaylist ? '저장 중…' : '재생목록 생성'}
          </button>
        )}
      </div>
    </section>
  );
}
