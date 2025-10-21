import {
  Suspense,
  lazy,
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const ClipPlayer = lazy(() => import('./ClipPlayer'));

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
  currentItemKey: string | null;
  currentIndex: number;
  isPlaying: boolean;
  isExpanded: boolean;
  isMobileViewport: boolean;
  canCreatePlaylist: boolean;
  canModifyPlaylist: boolean;
  onCreatePlaylist: () => void | Promise<unknown>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleExpanded: () => void;
  onSelectItem: (key: string) => void;
  onRemoveItem: (itemId: number) => void | Promise<unknown>;
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

const RemoveIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export default function PlaylistBar({
  items,
  currentItemKey,
  currentIndex,
  isPlaying,
  isExpanded,
  isMobileViewport,
  canCreatePlaylist,
  canModifyPlaylist,
  onCreatePlaylist,
  onPlayPause,
  onNext,
  onPrevious,
  onToggleExpanded,
  onSelectItem,
  onRemoveItem,
  onTrackEnded
}: PlaylistBarProps) {
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStateRef = useRef<{
    startY: number;
    isDragging: boolean;
    hasToggled: boolean;
    expandedAtStart: boolean;
  } | null>(null);
  const DRAG_THRESHOLD_PX = 48;
  const currentItem = useMemo(
    () => items.find((item) => item.key === currentItemKey) ?? null,
    [items, currentItemKey]
  );

  const hasPlayableItems = items.some((item) => item.isPlayable);
  const placeholderMessage = hasPlayableItems
    ? '재생할 항목을 선택하세요.'
    : '재생 가능한 항목이 없습니다.';

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

  const handleMobileDragStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!isMobileViewport) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      dragStateRef.current = {
        startY: touch.clientY,
        isDragging: true,
        hasToggled: false,
        expandedAtStart: isExpanded
      };
      setDragOffset(0);
    },
    [isMobileViewport, isExpanded]
  );

  const handleMobileDragMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state?.isDragging) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaY = touch.clientY - state.startY;
      const nextOffset = state.expandedAtStart
        ? Math.max(0, deltaY)
        : Math.min(0, deltaY);
      setDragOffset(nextOffset);

      if (state.hasToggled) {
        return;
      }

      if (!state.expandedAtStart && deltaY <= -DRAG_THRESHOLD_PX) {
        state.hasToggled = true;
        onToggleExpanded();
      } else if (state.expandedAtStart && deltaY >= DRAG_THRESHOLD_PX) {
        state.hasToggled = true;
        onToggleExpanded();
      }
    },
    [onToggleExpanded]
  );

  const resetDragState = useCallback(() => {
    dragStateRef.current = null;
    setDragOffset(0);
  }, []);

  const handleMobileDragEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.isDragging) {
        event.preventDefault();
      }
      resetDragState();
    },
    [resetDragState]
  );

  const handleMobileDragCancel = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  useEffect(() => {
    dragStateRef.current = null;
    setDragOffset(0);
  }, [isExpanded]);

  const renderQueueItem = (item: PlaylistBarItem, index: number) => {
    const isActive = item.key === currentItem?.key;
    const itemClasses = ['playback-bar__queue-item'];
    if (isActive) {
      itemClasses.push('playback-bar__queue-item--active');
    }
    if (!item.isPlayable) {
      itemClasses.push('playback-bar__queue-item--disabled');
    }
    const handleRemoveClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      if (!canModifyPlaylist) {
        return;
      }
      void onRemoveItem(item.itemId);
    };

    return (
      <li key={item.key} className={itemClasses.join(' ')}>
        <div className="playback-bar__queue-row">
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
          <button
            type="button"
            className="playback-bar__queue-remove"
            onClick={handleRemoveClick}
            disabled={!canModifyPlaylist}
            aria-label="재생목록에서 제거"
          >
            <RemoveIcon />
          </button>
        </div>
      </li>
    );
  };

  const renderPlayerContent = () => {
    if (!currentItem || !currentItem.isPlayable) {
      const placeholderClassName = isMobileViewport
        ? 'playback-bar__player-compact-placeholder'
        : 'playback-bar__player-placeholder';
      return (
        <div className={placeholderClassName} aria-live="polite">
          {placeholderMessage}
        </div>
      );
    }

    if (isMobileViewport) {
      return currentItem.thumbnailUrl ? (
        <img
          className="playback-bar__player-compact-thumbnail"
          src={currentItem.thumbnailUrl}
          alt={currentItem.title}
        />
      ) : (
        <div className="playback-bar__player-compact-placeholder" aria-live="polite">
          {placeholderMessage}
        </div>
      );
    }

    if (!currentItem.youtubeVideoId) {
      return (
        <div className="playback-bar__player-placeholder" aria-live="polite">
          {placeholderMessage}
        </div>
      );
    }

    return (
      <Suspense
        fallback={
          <div className="playback-bar__player-loading" role="status" aria-live="polite">
            플레이어 준비 중…
          </div>
        }
      >
        <ClipPlayer
          youtubeVideoId={currentItem.youtubeVideoId}
          startSec={currentItem.startSec}
          endSec={typeof currentItem.endSec === 'number' ? currentItem.endSec : undefined}
          autoplay={isPlaying}
          playing={isPlaying}
          shouldLoop={false}
          onEnded={onTrackEnded}
        />
      </Suspense>
    );
  };

  return (
    <div
      className="playback-bar"
      aria-label="재생 상태"
      style={{ '--playback-bar-translate-y': `${dragOffset}px` }}
    >
      {isMobileViewport && (
        <div
          className="playback-bar__drag-handle"
          onTouchStart={handleMobileDragStart}
          onTouchMove={handleMobileDragMove}
          onTouchEnd={handleMobileDragEnd}
          onTouchCancel={handleMobileDragCancel}
        >
          <div className="playback-bar__drag-grip" />
        </div>
      )}
      <div className="playback-bar__body">
        <div
          className={`playback-bar__player${isMobileViewport ? ' playback-bar__player--compact' : ''}`}
        >
          {renderPlayerContent()}
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
