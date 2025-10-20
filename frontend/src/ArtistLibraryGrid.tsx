import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef
} from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';

const ROW_GAP = 20;
const DEFAULT_CARD_HEIGHT = 320;
const MAX_VISIBLE_ROWS = 4;

const getMinCardWidth = (containerWidth: number): number => {
  if (containerWidth <= 480) {
    return 160;
  }
  if (containerWidth <= 768) {
    return 200;
  }
  return 240;
};

const getEstimatedCardHeight = (containerWidth: number): number => {
  if (containerWidth <= 480) {
    return 280;
  }
  return DEFAULT_CARD_HEIGHT;
};

export interface ArtistLibraryGridRenderContext<T> {
  index: number;
  isActive: boolean;
  onSelect: () => void;
  artist: T;
}

interface ArtistLibraryGridProps<T> {
  artists: readonly T[];
  getArtistId: (artist: T) => number;
  selectedArtistId: number | null;
  onArtistClick: (artistId: number) => void;
  renderCard: (artist: T, context: ArtistLibraryGridRenderContext<T>) => ReactNode;
  role?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
}

interface ArtistGridItemData<T> {
  rows: T[][];
  columns: number;
  getArtistId: (artist: T) => number;
  selectedArtistId: number | null;
  onArtistClick: (artistId: number) => void;
  renderCard: (artist: T, context: ArtistLibraryGridRenderContext<T>) => ReactNode;
}

const clampColumns = (columns: number): number => {
  if (!Number.isFinite(columns) || columns <= 0) {
    return 1;
  }
  return columns;
};

const createRows = <T,>(artists: readonly T[], columns: number): T[][] => {
  const normalizedColumns = clampColumns(columns);
  if (artists.length === 0) {
    return [];
  }
  const rows: T[][] = [];
  for (let index = 0; index < artists.length; index += normalizedColumns) {
    rows.push(artists.slice(index, index + normalizedColumns));
  }
  return rows;
};

const ArtistGridRow = <T,>({ data, index, style }: ListChildComponentProps<ArtistGridItemData<T>>) => {
  const { rows, columns, getArtistId, selectedArtistId, onArtistClick, renderCard } = data;
  const rowArtists = rows[index] ?? ([] as T[]);
  const adjustedStyle: CSSProperties = {
    ...style,
    height: Math.max((style.height as number) - ROW_GAP, 0),
    paddingBottom: ROW_GAP
  };

  return (
    <div style={adjustedStyle} role="presentation">
      <div
        className="artist-library__grid-row"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${ROW_GAP}px`
        }}
      >
        {rowArtists.map((artist: T, columnIndex: number) => {
          const artistId = getArtistId(artist);
          const isValidId = Number.isFinite(artistId);
          const isActive = isValidId && selectedArtistId === artistId;
          const cardKey = isValidId ? String(artistId) : `${index}-${columnIndex}`;
          const handleSelect = () => {
            if (isValidId) {
              onArtistClick(artistId);
            }
          };
          return (
            <div key={cardKey} role="listitem" className="artist-library__grid-item">
              {renderCard(artist, {
                index: index * columns + columnIndex,
                isActive,
                onSelect: handleSelect,
                artist
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const createOuterElement = (
  role: string | undefined,
  ariaLabel: string | undefined,
  ariaLabelledby: string | undefined
) => {
  const OuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (props, ref) => (
      <div
        {...props}
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={['artist-library__grid', 'artist-library__grid--virtualized', props.className]
          .filter(Boolean)
          .join(' ')}
      />
    )
  );
  OuterElement.displayName = 'ArtistLibraryGridOuter';
  return OuterElement;
};

const ArtistLibraryGrid = <T,>({
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

  const columns = useMemo(() => {
    if (containerWidth <= 0) {
      return 1;
    }
    const minCardWidth = getMinCardWidth(containerWidth);
    const calculated = Math.floor((containerWidth + ROW_GAP) / (minCardWidth + ROW_GAP));
    return Math.max(calculated, 1);
  }, [containerWidth]);

  const rows = useMemo(() => createRows(artists, columns), [artists, columns]);

  const rowCount = rows.length;
  const estimatedCardHeight = getEstimatedCardHeight(containerWidth);
  const itemSize = estimatedCardHeight + ROW_GAP;
  const visibleRowCount = Math.min(rowCount, MAX_VISIBLE_ROWS);
  const listHeight = visibleRowCount > 0 ? visibleRowCount * itemSize : 0;

  const itemData = useMemo<ArtistGridItemData<T>>(
    () => ({ rows, columns, getArtistId, selectedArtistId, onArtistClick, renderCard }),
    [rows, columns, getArtistId, selectedArtistId, onArtistClick, renderCard]
  );

  const outerElementType = useMemo(
    () => createOuterElement(role, ariaLabel, ariaLabelledby),
    [role, ariaLabel, ariaLabelledby]
  );

  const renderRow = useCallback(
    (props: ListChildComponentProps<ArtistGridItemData<T>>) => <ArtistGridRow<T> {...props} />,
    []
  );

  if (rowCount === 0) {
    return (
      <div
        ref={containerRef}
        className="artist-library__grid artist-library__grid--empty"
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      />
    );
  }

  if (containerWidth === 0) {
    return (
      <div
        ref={containerRef}
        className="artist-library__grid"
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      >
        {artists.map((artist: T, index: number) => {
          const artistId = getArtistId(artist);
          const key = Number.isFinite(artistId) ? String(artistId) : `artist-${index}`;
          const handleSelect = () => {
            if (Number.isFinite(artistId)) {
              onArtistClick(artistId);
            }
          };
          return (
            <div key={key} role="listitem" className="artist-library__grid-item">
              {renderCard(artist, {
                index,
                isActive: Number.isFinite(artistId) && selectedArtistId === artistId,
                onSelect: handleSelect,
                artist
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="artist-library__grid-wrapper">
      <FixedSizeList<ArtistGridItemData<T>>
        height={listHeight}
        width={containerWidth}
        itemCount={rowCount}
        itemSize={itemSize}
        itemData={itemData}
        outerElementType={outerElementType}
        innerElementType="div"
      >
        {renderRow}
      </FixedSizeList>
    </div>
  );
};

export default ArtistLibraryGrid;
