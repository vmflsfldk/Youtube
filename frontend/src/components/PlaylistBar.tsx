import { useCallback, useMemo, useState } from 'react';
import ClipPlayer from './ClipPlayer';

export interface PlaylistBarItem {
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
  currentItemKey: string | null;
  currentIndex: number;
  isPlaying: boolean;
  isExpanded: boolean;
  canCreatePlaylist: boolean;
  onCreatePlaylist: () => void | Promise<void>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleExpanded: () => void;
  onSelectItem: (key: string) => void;
  onTrackEnded: () => void;
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

const ChevronIcon = ({ direction }: { direction: 'up' | 'down' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {direction === 'up' ? (
      <path fill="currentColor" d="m6 15 6-6 6 6H6z" />
    ) : (
      <path fill="currentColor" d="m6 9 6 6 6-6H6z" />
    )}
  </svg>
);

export default function PlaylistBar({
  items,
  currentItemKey,
  currentIndex,
  isPlaying,
  isExpanded,
  canCreatePlaylist,
  onCreatePlaylist,
  onPlayPause,
  onNext,
  onPrevious,
  onToggleExpanded,
  onSelectItem,
  onTrackEnded
}: PlaylistBarProps) {
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const currentItem = useMemo(
    () => items.find((item) => item.key === currentItemKey) ?? null,
    [items, currentItemKey]
  );

  const hasPlayableItems = items.some((item) => item.isPlayable);

  const handleCreatePlaylistClick = useCallback(async () => {
    if (!canCreatePlaylist || isCreatingPlaylist) {
      return;
    }
    try {
      setIsCreatingPlaylist(true);
      await Promise.resolve(onCreatePlaylist());
    } catch (error) {
      console.error('Failed to create playlist from playback bar', error);
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [canCreatePlaylist, isCreatingPlaylist, onCreatePlaylist]);

  const renderControls = () => {
    const disableTransport = !hasPlayableItems || !currentItem?.isPlayable;
    return (
      <div className="playback-bar__controls">
        <div className="playback-bar__transport" role="group" aria-label="재생 제어">
          <button
            type="button"
            className="playback-bar__button"
            onClick={onPrevious}
            disabled={!hasPlayableItems}
            aria-label="이전 항목"
          >
            <PreviousIcon />
          </button>
          <button
            type="button"
            className="playback-bar__button playback-bar__button--primary"
            onClick={onPlayPause}
            disabled={!hasPlayableItems}
            aria-label={isPlaying ? '일시 정지' : '재생'}
          >
            {isPlaying && currentItem?.isPlayable && !disableTransport ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="playback-bar__button"
            onClick={onNext}
            disabled={!hasPlayableItems}
            aria-label="다음 항목"
          >
            <NextIcon />
          </button>
        </div>
        <button
          type="button"
          className="playback-bar__create-playlist-button"
          onClick={handleCreatePlaylistClick}
          disabled={!canCreatePlaylist || isCreatingPlaylist}
        >
          {isCreatingPlaylist ? '만드는 중…' : '새 재생목록 만들기'}
        </button>
      </div>
    );
  };

  const renderQueueItem = (item: PlaylistBarItem, index: number) => {
    const isActive = item.key === currentItem?.key;
    const itemClasses = ['playback-bar__queue-item'];
    if (isActive) {
      itemClasses.push('playback-bar__queue-item--active');
    }
    if (!item.isPlayable) {
      itemClasses.push('playback-bar__queue-item--disabled');
    }

    return (
      <li key={item.key} className={itemClasses.join(' ')}>
        <button
          type="button"
          className="playback-bar__queue-button"
          onClick={() => onSelectItem(item.key)}
          disabled={!item.isPlayable}
        >
          <div className="playback-bar__queue-index" aria-hidden="true">
            {index + 1}
          </div>
          <div className="playback-bar__queue-thumbnail" aria-hidden="true">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" />
            ) : (
              <span className="playback-bar__queue-thumbnail--placeholder">No image</span>
            )}
          </div>
          <div className="playback-bar__queue-meta">
            <div className="playback-bar__queue-title-row">
              {item.badgeLabel && <span className="playback-bar__queue-badge">{item.badgeLabel}</span>}
              <span className="playback-bar__queue-title">{item.title}</span>
            </div>
            {item.subtitle && <span className="playback-bar__queue-subtitle">{item.subtitle}</span>}
            {item.rangeLabel && <span className="playback-bar__queue-range">{item.rangeLabel}</span>}
          </div>
          {item.durationLabel && (
            <span className="playback-bar__queue-duration">{item.durationLabel}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="playback-bar" aria-label="재생 상태">
      <div className="playback-bar__body">
        <div className="playback-bar__player">
          {currentItem && currentItem.youtubeVideoId && currentItem.isPlayable ? (
            <ClipPlayer
              youtubeVideoId={currentItem.youtubeVideoId}
              startSec={currentItem.startSec}
              endSec={typeof currentItem.endSec === 'number' ? currentItem.endSec : undefined}
              autoplay={isPlaying}
              playing={isPlaying}
              shouldLoop={false}
              onEnded={onTrackEnded}
            />
          ) : (
            <div className="playback-bar__player-placeholder" aria-live="polite">
              {hasPlayableItems
                ? '재생할 항목을 선택하세요.'
                : '재생 가능한 항목이 없습니다.'}
            </div>
          )}
        </div>
        <div className="playback-bar__info">
          <div className="playback-bar__info-row">
            <div className="playback-bar__now-playing">
              <span className="playback-bar__now-playing-label">Now Playing</span>
              <span className="playback-bar__now-playing-index">
                {currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : `0/${items.length}`}
              </span>
            </div>
            <button
              type="button"
              className="playback-bar__toggle"
              onClick={onToggleExpanded}
              aria-expanded={isExpanded}
              aria-controls="playbackBarQueue"
            >
              <span>{isExpanded ? '목록 접기' : '목록 펼치기'}</span>
              <ChevronIcon direction={isExpanded ? 'down' : 'up'} />
            </button>
          </div>
          <div className="playback-bar__track-meta" aria-live="polite">
            <h2 className="playback-bar__title">{currentItem?.title ?? '대기 중'}</h2>
            {currentItem?.subtitle && (
              <p className="playback-bar__subtitle">{currentItem.subtitle}</p>
            )}
          </div>
          {renderControls()}
        </div>
      </div>
      <div
        id="playbackBarQueue"
        className={`playback-bar__queue${isExpanded ? ' playback-bar__queue--visible' : ''}`}
      >
        {items.length === 0 ? (
          <p className="playback-bar__queue-empty">재생 목록이 비어 있습니다.</p>
        ) : (
          <ul className="playback-bar__queue-list">
            {items.map((item, index) => renderQueueItem(item, index))}
          </ul>
        )}
      </div>
    </div>
  );
}
