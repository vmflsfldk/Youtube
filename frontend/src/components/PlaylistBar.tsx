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
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';

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
  currentItemKey: string | null;
  currentIndex: number;
  playbackActivationNonce: number;
  isPlaying: boolean;
  isExpanded: boolean;
  isMobileViewport: boolean;
  canCreatePlaylist: boolean;
  canModifyPlaylist: boolean;
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
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g transform="translate(-2.5 0)">
      <path fill="currentColor" d="m8 5 13 7-13 7V5z" />
    </g>
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g transform="translate(1 0)">
      <path fill="currentColor" d="M5 5.5v13l9-6.5-9-6.5zm10 0h2v13h-2z" />
    </g>
  </svg>
);

const PreviousIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g transform="translate(-1 0)">
      <path fill="currentColor" d="M19 5.5v13l-9-6.5 9-6.5zm-10 0h-2v13h2z" />
    </g>
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

const playbackBarVariants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 }
};

const playbackBarTransition = { duration: 0.24, ease: 'easeOut' as const };

const queueVariants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' as const },
  exit: { opacity: 0, height: 0 }
};

const queueTransition = { duration: 0.2, ease: 'easeOut' as const };

export default function PlaylistBar({
  items,
  currentItemKey,
  currentIndex,
  playbackActivationNonce,
  isPlaying,
  isExpanded,
  isMobileViewport,
  canCreatePlaylist,
  canModifyPlaylist,
  onCreatePlaylist,
  onPlayPause,
  onNext,
  onPrevious,
  repeatMode,
  onRepeatModeChange,
  onToggleExpanded,
  onSelectItem,
  onRemoveItem,
  onTrackEnded
}: PlaylistBarProps) {
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const dragTranslateY = useMotionValue(0);
  const animatedTranslateY = useSpring(dragTranslateY, {
    stiffness: 520,
    damping: 42,
    mass: 0.8
  });
  const dragStateRef = useRef<{
    startY: number;
    isDragging: boolean;
    hasToggled: boolean;
    expandedAtStart: boolean;
  } | null>(null);
  const dragHeight = useMotionValue(0);
  const collapsedHeightRef = useRef(0);
  const expandedHeightRef = useRef(0);
  const [collapsedWrapper, setCollapsedWrapper] = useState<HTMLDivElement | null>(null);
  const [expandedLayout, setExpandedLayout] = useState<HTMLDivElement | null>(null);
  const measureCollapsedContentHeight = useCallback((node: HTMLDivElement) => {
    const previousHeight = node.style.height;
    const hadPreviousHeight = previousHeight.length > 0;
    node.style.height = '';
    const nextHeight = node.scrollHeight;
    if (hadPreviousHeight) {
      node.style.height = previousHeight;
    } else {
      node.style.removeProperty('height');
    }
    return nextHeight;
  }, []);

  const handleCollapsedWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      setCollapsedWrapper(node);
      if (!node || !isMobileViewport) {
        return;
      }
      const nextHeight = measureCollapsedContentHeight(node);
      collapsedHeightRef.current = nextHeight;
      if (!isExpanded && nextHeight > 0) {
        dragHeight.set(nextHeight);
      }
    },
    [dragHeight, isExpanded, isMobileViewport, measureCollapsedContentHeight]
  );
  const handleExpandedLayoutRef = useCallback(
    (node: HTMLDivElement | null) => {
      setExpandedLayout(node);
      if (!node || !isMobileViewport) {
        return;
      }
      const nextHeight = node.getBoundingClientRect().height;
      expandedHeightRef.current = nextHeight;
      if (isExpanded && nextHeight > 0) {
        dragHeight.set(nextHeight);
      }
    },
    [dragHeight, isExpanded, isMobileViewport]
  );
  const DRAG_THRESHOLD_PX = 48;
  const DRAG_ACTIVATION_DELTA_PX = 6;
  const currentItem = useMemo(
    () => items.find((item) => item.key === currentItemKey) ?? null,
    [items, currentItemKey]
  );

  const isMobileCollapsed = isMobileViewport && !isExpanded;

  const resetDragState = useCallback(() => {
    dragStateRef.current = null;
    dragTranslateY.stop();
    dragTranslateY.set(0);
    if (!isMobileViewport) {
      return;
    }
    const targetHeight = isExpanded
      ? expandedHeightRef.current || collapsedHeightRef.current
      : collapsedHeightRef.current;
    if (targetHeight > 0) {
      dragHeight.set(targetHeight);
    }
  }, [dragHeight, dragTranslateY, isExpanded, isMobileViewport]);

  const hasPlayableItems = items.some((item) => item.isPlayable);
  const placeholderMessage = hasPlayableItems
    ? '재생할 항목을 선택하세요.'
    : '재생 가능한 항목이 없습니다.';

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
      console.error('Failed to create playlist from playback bar', error);
    } finally {
      setIsCreatingPlaylist(false);
    }
  }, [canCreatePlaylist, isCreatingPlaylist, onCreatePlaylist]);

  const renderTransport = (className?: string) => {
    const disableTransport = !hasPlayableItems || !currentItem?.isPlayable;
    const repeatAllActive = repeatMode === 'all';
    const repeatOneActive = repeatMode === 'one';
    const repeatAllLabel = repeatAllActive ? '전체 반복 끄기' : '전체 반복 켜기';
    const repeatOneLabel = repeatOneActive ? '한 곡 반복 끄기' : '한 곡 반복 켜기';
    const repeatAllClasses = ['playback-bar__button', 'playback-bar__button--toggle'];
    const repeatOneClasses = ['playback-bar__button', 'playback-bar__button--toggle'];
    if (repeatAllActive) {
      repeatAllClasses.push('playback-bar__button--active');
    }
    if (repeatOneActive) {
      repeatOneClasses.push('playback-bar__button--active');
    }

    return (
      <div className={className ?? 'playback-bar__transport'} role="group" aria-label="재생 제어">
        <div className="playback-bar__transport-main" role="group" aria-label="기본 재생 제어">
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
        <div className="playback-bar__repeat-group" role="group" aria-label="반복 모드">
          <button
            type="button"
            className={repeatAllClasses.join(' ')}
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
            className={repeatOneClasses.join(' ')}
            onClick={() => handleRepeatButtonClick('one')}
            disabled={!hasPlayableItems}
            aria-pressed={repeatOneActive}
            aria-label={repeatOneLabel}
            title={repeatOneLabel}
          >
            <RepeatOneIcon />
          </button>
        </div>
      </div>
    );
  };

  const renderControls = () => {
    return (
      <div className="playback-bar__controls">
        {renderTransport()}
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
      if (isExpanded) {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('.playback-bar__drag-handle')) {
          dragStateRef.current = null;
          return;
        }
      }
      if (event.touches.length !== 1) {
        resetDragState();
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      dragStateRef.current = {
        startY: touch.clientY,
        isDragging: false,
        hasToggled: false,
        expandedAtStart: isExpanded
      };
      dragTranslateY.stop();
      dragTranslateY.set(0);
    },
    [dragTranslateY, isExpanded, isMobileViewport, resetDragState]
  );

  const handleMobileDragMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }
      if (event.touches.length !== 1) {
        resetDragState();
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaY = touch.clientY - state.startY;
      if (!state.isDragging) {
        if (Math.abs(deltaY) < DRAG_ACTIVATION_DELTA_PX) {
          return;
        }
        state.isDragging = true;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      const nextOffset = state.expandedAtStart
        ? Math.max(0, deltaY)
        : Math.min(0, deltaY);
      dragTranslateY.set(nextOffset);

      if (!state.expandedAtStart) {
        const collapsedHeight = collapsedHeightRef.current || 0;
        const expandedHeight = expandedHeightRef.current || collapsedHeight;
        const maxGrowth = Math.max(0, expandedHeight - collapsedHeight);
        const growth = Math.min(maxGrowth, Math.abs(nextOffset));
        const nextHeight = collapsedHeight + growth;
        if (nextHeight > 0) {
          dragHeight.set(nextHeight);
        }
      }

      if (state.hasToggled) {
        return;
      }

      if (!state.expandedAtStart && deltaY <= -DRAG_THRESHOLD_PX) {
        state.hasToggled = true;
        const expandedHeight = expandedHeightRef.current || collapsedHeightRef.current;
        if (expandedHeight > 0) {
          dragHeight.set(Math.max(collapsedHeightRef.current, expandedHeight));
        }
        onToggleExpanded();
      } else if (state.expandedAtStart && deltaY >= DRAG_THRESHOLD_PX) {
        state.hasToggled = true;
        onToggleExpanded();
      }
    },
    [dragTranslateY, onToggleExpanded, resetDragState]
  );

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
    resetDragState();
  }, [isExpanded, resetDragState]);

  useEffect(() => {
    if (!isMobileViewport) {
      resetDragState();
    }
  }, [isMobileViewport, resetDragState]);

  useEffect(() => {
    const node = collapsedWrapper;
    if (!node || !isMobileViewport) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = measureCollapsedContentHeight(node);
      collapsedHeightRef.current = nextHeight;
      if (!isExpanded && nextHeight > 0) {
        dragHeight.set(nextHeight);
      }
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [collapsedWrapper, dragHeight, isExpanded, isMobileViewport, measureCollapsedContentHeight]);

  useEffect(() => {
    const node = expandedLayout;
    if (!node || !isMobileViewport) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = node.getBoundingClientRect().height;
      expandedHeightRef.current = nextHeight;
      if (isExpanded && nextHeight > 0) {
        dragHeight.set(nextHeight);
      }
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [expandedLayout, dragHeight, isExpanded, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) {
      dragHeight.set(0);
    }
  }, [dragHeight, isMobileViewport]);

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

  const clipPlayerContent = useMemo(() => {
    if (!currentItem || !currentItem.isPlayable || !currentItem.youtubeVideoId) {
      return null;
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
          key={playbackActivationNonce}
          youtubeVideoId={currentItem.youtubeVideoId}
          startSec={currentItem.startSec}
          endSec={typeof currentItem.endSec === 'number' ? currentItem.endSec : undefined}
          autoplay={isPlaying}
          playing={isPlaying}
          shouldLoop={repeatMode === 'one'}
          onEnded={onTrackEnded}
          activationNonce={playbackActivationNonce}
        />
      </Suspense>
    );
  }, [currentItem, isPlaying, onTrackEnded, playbackActivationNonce, repeatMode]);

  const hiddenPlayerContent = useMemo(() => {
    if (!isMobileViewport || !clipPlayerContent) {
      return null;
    }

    return (
      <div className="playback-bar__player-hidden" aria-hidden="true">
        {clipPlayerContent}
      </div>
    );
  }, [clipPlayerContent, isMobileViewport]);

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
      if (currentItem.thumbnailUrl) {
        return (
          <img
            className="playback-bar__player-compact-thumbnail"
            src={currentItem.thumbnailUrl}
            alt={currentItem.title}
          />
        );
      }

      return (
        <div className="playback-bar__player-compact-placeholder" aria-live="polite">
          {placeholderMessage}
        </div>
      );
    }

    if (!clipPlayerContent) {
      return (
        <div className="playback-bar__player-placeholder" aria-live="polite">
          {placeholderMessage}
        </div>
      );
    }

    return clipPlayerContent;
  };

  if (isMobileCollapsed) {
    const collapsedTitle = currentItem?.title ?? placeholderMessage;
    const collapsedIndexLabel = currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : `0/${items.length}`;
    const collapsedClassName = `playback-bar playback-bar--mobile-collapsed${
      isMobileViewport ? ' playback-bar--mobile-collapsed--with-offset' : ''
    }`;

    return (
      <>
        {hiddenPlayerContent}
        <motion.div
          key="playbackBarMobile"
          className={collapsedClassName}
          aria-label="재생 상태"
          ref={handleCollapsedWrapperRef}
          style={{ y: animatedTranslateY, height: dragHeight }}
          initial={playbackBarVariants.initial}
          animate={playbackBarVariants.animate}
          exit={playbackBarVariants.exit}
          transition={playbackBarTransition}
          onTouchStart={handleMobileDragStart}
          onTouchMove={handleMobileDragMove}
          onTouchEnd={handleMobileDragEnd}
          onTouchCancel={handleMobileDragCancel}
        >
          <div className="playback-bar__drag-handle">
            <div className="playback-bar__drag-grip" />
          </div>
          <div className="playback-bar__collapsed-body">
            <button
              type="button"
              className="playback-bar__collapsed-toggle"
              onClick={onToggleExpanded}
              aria-expanded={false}
              aria-label="재생 목록 펼치기"
            >
              {currentItem?.thumbnailUrl ? (
                <img
                  className="playback-bar__collapsed-thumbnail"
                  src={currentItem.thumbnailUrl}
                  alt={currentItem.title}
                />
              ) : (
                <div className="playback-bar__collapsed-placeholder" aria-live="polite">
                  {placeholderMessage}
                </div>
              )}
              <div className="playback-bar__collapsed-meta" aria-live="polite">
                <div className="playback-bar__collapsed-label-row">
                  <span className="playback-bar__collapsed-label">Now Playing</span>
                  <span className="playback-bar__collapsed-index">{collapsedIndexLabel}</span>
                </div>
                <span className="playback-bar__collapsed-title">{collapsedTitle}</span>
                {currentItem?.subtitle && (
                  <span className="playback-bar__collapsed-subtitle">{currentItem.subtitle}</span>
                )}
              </div>
            </button>
            <div className="playback-bar__collapsed-controls">
              {renderTransport('playback-bar__transport playback-bar__transport--compact')}
            </div>
          </div>
        </motion.div>
      </>
    );
  }

  return (
    <>
      {hiddenPlayerContent}
      <motion.div
        key="playbackBarDesktop"
        className="playback-bar"
        aria-label="재생 상태"
        ref={handleExpandedLayoutRef}
        style={{ y: animatedTranslateY }}
        initial={playbackBarVariants.initial}
        animate={playbackBarVariants.animate}
        exit={playbackBarVariants.exit}
        transition={playbackBarTransition}
        onTouchStart={isMobileViewport ? handleMobileDragStart : undefined}
        onTouchMove={isMobileViewport ? handleMobileDragMove : undefined}
        onTouchEnd={isMobileViewport ? handleMobileDragEnd : undefined}
        onTouchCancel={isMobileViewport ? handleMobileDragCancel : undefined}
      >
        {isMobileViewport && (
          <div className="playback-bar__drag-handle">
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
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="playbackBarQueue"
              id="playbackBarQueue"
              className="playback-bar__queue playback-bar__queue--visible"
              initial={queueVariants.initial}
              animate={queueVariants.animate}
              exit={queueVariants.exit}
              transition={queueTransition}
            >
              {items.length === 0 ? (
                <p className="playback-bar__queue-empty">재생 목록이 비어 있습니다.</p>
              ) : (
                <ul className="playback-bar__queue-list">
                  {items.map((item, index) => renderQueueItem(item, index))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
