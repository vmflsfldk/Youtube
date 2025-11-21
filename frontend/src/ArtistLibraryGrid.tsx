import { memo, useState, useMemo, useEffect } from 'react';
import ArtistLibraryCard, { type ArtistLibraryCardData } from './components/ArtistLibraryCard';
import type { ArtistResponse } from './types/artists';

interface ArtistLibraryGridProps {
  artists: ArtistResponse[];
  filter: 'all' | 'live' | 'bookmark';
  searchQuery: string;
  onSelectArtist: (artist: ArtistResponse) => void;
}

const ArtistLibraryGrid = ({
  artists,
  getArtistId,
  selectedArtistId,
  onArtistClick,
  renderCard,
  role = 'list',
  ariaLabel,
  ariaLabelledby
}: ArtistLibraryGridProps<T>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measuredCardHeight, setMeasuredCardHeight] = useState<number | null>(null);
  const [chzzkLiveMap, setChzzkLiveMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const checkAllLives = async () => {
      const newLiveStatus: Record<string, boolean> = {};

      const promises = artists.map(async (artist) => {
        const chzzkChannelId = (artist as { chzzkChannelId?: string | null }).chzzkChannelId;
        if (!chzzkChannelId) {
          return;
        }

        const artistId = getArtistId(artist);
        if (!Number.isFinite(artistId)) {
          return;
        }

        try {
          const res = await fetch(`/api/chzzk/status?channelId=${chzzkChannelId}`);
          const data = await res.json();
          console.log(`📡 API 결과 [${(artist as { name?: string }).name ?? artistId}]:`, data);

          if (data.isLive) {
            newLiveStatus[String(artistId)] = true;
            console.log(`✅ [${(artist as { name?: string }).name ?? artistId}] 방송 중 확인됨!`);
          }
        } catch (err) {
          console.error(`❌ 치지직 체크 실패 [${(artist as { name?: string }).name ?? artistId}]:`, err);
        }
      });

      if (hasUpdates) {
        console.log('🔄 상태 업데이트 적용:', newLiveStatus);
        setChzzkLiveMap((prev) => ({ ...prev, ...newLiveStatus }));
      }
    };

    if (artists.length > 0) {
      checkAllLives();
    }
  }, [artists, getArtistId]);

  const getLiveStatus = useCallback(
    (artist: T) => {
      const artistId = getArtistId(artist);
      const chzzkKey = Number.isFinite(artistId) ? String(artistId) : undefined;
      const isChzzkLive = chzzkKey ? !!chzzkLiveMap[chzzkKey] : false;
      const liveVideos = (artist as { liveVideos?: unknown }).liveVideos;
      const isYoutubeLive = Array.isArray(liveVideos) && liveVideos.length > 0;
      const artistName = (artist as { name?: string }).name ?? '';

      if (artistName.includes('리제')) {
        console.log(`🔍 필터 검사 [${artistName}]:`, {
          isChzzkLive,
          isYoutubeLive,
          finalIsLive: isYoutubeLive || isChzzkLive,
          chzzkMapValue: chzzkKey ? chzzkLiveMap[chzzkKey] : undefined
        });
      }

      return {
        isChzzkLive,
        isYoutubeLive,
        isLive: isYoutubeLive || isChzzkLive
      };
    },
    [chzzkLiveMap, getArtistId]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const target = containerRef.current;
      if (!target) {
        return;
      }
      const width = target.getBoundingClientRect().width;
      setContainerWidth((previous) => (Math.abs(previous - width) < 0.5 ? previous : width));
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }

    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        const width = entries[0].contentRect.width;
        setContainerWidth((previous) => (Math.abs(previous - width) < 0.5 ? previous : width));
      } else {
        updateSize();
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });

  const rowGap = useMemo(() => getRowGap(containerWidth), [containerWidth]);

  const columns = useMemo(() => {
    if (containerWidth <= 0) {
      return 1;
    }
    if (containerWidth <= 560) {
      return 1;
    }
    const minCardWidth = getMinCardWidth(containerWidth);
    const calculated = Math.floor((containerWidth + rowGap) / (minCardWidth + rowGap));
    return Math.max(calculated, 1);
  }, [containerWidth, rowGap]);

  const rows = useMemo(() => createRows(artists, columns), [artists, columns]);

  const rowCount = rows.length;
  const estimatedCardHeight = getEstimatedCardHeight(containerWidth);
  const effectiveCardHeight = Math.max(
    measuredCardHeight ?? estimatedCardHeight,
    MIN_CARD_HEIGHT
  );
  const itemSize = effectiveCardHeight + rowGap;
  const visibleRowCount = Math.min(rowCount, MAX_VISIBLE_ROWS);
  const listHeight = visibleRowCount > 0 ? visibleRowCount * itemSize : 0;

  const itemData = useMemo<ArtistGridItemData<T>>(
    () => ({ rows, columns, rowGap, getArtistId, selectedArtistId, onArtistClick, renderCard, getLiveStatus }),
    [rows, columns, rowGap, getArtistId, selectedArtistId, onArtistClick, renderCard, getLiveStatus]
  );

  const outerElementType = useMemo(
    () => createOuterElement(role, ariaLabel, ariaLabelledby),
    [role, ariaLabel, ariaLabelledby]
  );

  const renderRow = useCallback(
    (props: ListChildComponentProps<ArtistGridItemData<T>>) => <ArtistGridRow<T> {...props} />,
    []
  );

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let intervalId: number | null = null;
    let rafId: number | null = null;
    let resizeListener: (() => void) | null = null;
    const isWindowAvailable = typeof window !== 'undefined';

    const updateMeasuredHeight = (target?: Element | null) => {
      const element = (target as HTMLElement | undefined) ??
        containerRef.current?.querySelector<HTMLElement>('.artist-library__grid-item');
      if (!element) {
        return element;
      }
      const { height } = element.getBoundingClientRect();
      if (height > 0) {
        setMeasuredCardHeight((previous) =>
          previous !== null && Math.abs(previous - height) < 0.5 ? previous : height
        );
      }
      return element;
    };

    const ensureMeasurementTarget = () => {
      const element = updateMeasuredHeight();
      if (!element) {
        if (isWindowAvailable) {
          rafId = window.requestAnimationFrame(ensureMeasurementTarget);
        }
      }

      const isChzzkLive = !!chzzkLiveMap[String(artist.id)];
      const isYoutubeLive = artist.liveVideos && artist.liveVideos.length > 0;
      const isLive = isYoutubeLive || isChzzkLive;

      if (filter === 'live' && !isLive) {
        return false;
      }

      return true;
    });
  }, [artists, filter, searchQuery, chzzkLiveMap]);

  if (filteredArtists.length === 0) {
    return <div className="text-center p-8 text-gray-500">표시할 아티스트가 없습니다.</div>;
  }

  return (
    <div className="artist-library__grid">
      {filteredArtists.map((artist) => {
        const cardData: ArtistLibraryCardData = {
          fallbackAvatarUrl: '/default-profile.png',
          countryBadges: [],
          agency: artist.agency || '',
          tags: artist.tags || [],
          displayName: artist.displayName || artist.name
        };

        return (
          <ArtistLibraryCard
            key={artist.id}
            artist={artist}
            cardData={cardData}
            onSelect={() => onSelectArtist(artist)}
          />
        );
      })}
    </div>
  );
};

export default memo(ArtistLibraryGrid);
