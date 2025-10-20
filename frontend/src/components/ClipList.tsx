import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { VariableSizeList, type ListChildComponentProps } from 'react-window';

export interface ClipListRenderResult {
  className?: string;
  content: ReactNode;
}

export interface ClipListRenderContext<TItem, TItemData> {
  index: number;
  clip: TItem;
  isVisible: boolean;
  itemData: TItemData;
}

interface ClipListItemData<TItem, TItemData> {
  clips: readonly TItem[];
  renderItem: (item: TItem, context: ClipListRenderContext<TItem, TItemData>) => ClipListRenderResult;
  registerSize: (index: number, size: number) => void;
  visibleStartIndex: number;
  visibleStopIndex: number;
  itemData: TItemData;
}

const DEFAULT_ESTIMATED_ITEM_HEIGHT = 320;
const DEFAULT_MAX_VISIBLE_ITEMS = 6;

const ClipListItem = <TItem, TItemData>({
  data,
  index,
  style
}: ListChildComponentProps<ClipListItemData<TItem, TItemData>>) => {
  const { clips, renderItem, registerSize, visibleStartIndex, visibleStopIndex, itemData } = data;
  const clip = clips[index];
  const itemRef = useRef<HTMLLIElement | null>(null);
  const isVisible = index >= visibleStartIndex && index <= visibleStopIndex;

  useLayoutEffect(() => {
    const element = itemRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (Number.isFinite(height) && height > 0) {
        registerSize(index, Math.ceil(height));
      }
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') {
        return;
      }
      const handleResize = () => measure();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [index, registerSize, clip]);

  if (!clip) {
    return null;
  }

  const { className, content } = renderItem(clip, { index, clip, isVisible, itemData });
  const adjustedStyle: CSSProperties = {
    ...style,
    width: '100%'
  };

  return (
    <li ref={itemRef} style={adjustedStyle} className={className}>
      {content}
    </li>
  );
};

export interface ClipListProps<TItem, TItemData = undefined> {
  clips: readonly TItem[];
  getItemKey: (clip: TItem) => string | number;
  renderItem: (item: TItem, context: ClipListRenderContext<TItem, TItemData>) => ClipListRenderResult;
  itemData?: TItemData;
  className?: string;
  role?: string;
  overscanCount?: number;
  estimatedItemHeight?: number;
  maxVisibleItems?: number;
}

const ClipList = <TItem, TItemData = undefined>({
  clips,
  getItemKey,
  renderItem,
  itemData,
  className,
  role = 'list',
  overscanCount = 3,
  estimatedItemHeight = DEFAULT_ESTIMATED_ITEM_HEIGHT,
  maxVisibleItems = DEFAULT_MAX_VISIBLE_ITEMS
}: ClipListProps<TItem, TItemData>) => {
  const listRef = useRef<VariableSizeList | null>(null);
  const sizeMapRef = useRef<Map<number, number>>(new Map());
  const [measuredItemHeight, setMeasuredItemHeight] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: number; stop: number }>({ start: 0, stop: -1 });

  const registerSize = useCallback(
    (index: number, size: number) => {
      if (!Number.isFinite(size) || size <= 0) {
        return;
      }
      const previous = sizeMapRef.current.get(index);
      if (previous === size) {
        return;
      }
      sizeMapRef.current.set(index, size);
      if (listRef.current) {
        listRef.current.resetAfterIndex(index);
      }
      setMeasuredItemHeight((current) => (current === null ? size : current));
    },
    []
  );

  const getSize = useCallback(
    (index: number) => sizeMapRef.current.get(index) ?? measuredItemHeight ?? estimatedItemHeight,
    [estimatedItemHeight, measuredItemHeight]
  );

  useLayoutEffect(() => {
    sizeMapRef.current.clear();
    if (listRef.current) {
      listRef.current.resetAfterIndex(0, true);
    }
  }, [clips]);

  const itemDataWithState = useMemo<ClipListItemData<TItem, TItemData>>(
    () => ({
      clips,
      renderItem,
      registerSize,
      visibleStartIndex: visibleRange.start,
      visibleStopIndex: visibleRange.stop,
      itemData: itemData as TItemData
    }),
    [clips, renderItem, registerSize, visibleRange.start, visibleRange.stop, itemData]
  );

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: { visibleStartIndex: number; visibleStopIndex: number }) => {
      setVisibleRange((previous) => {
        if (previous.start === visibleStartIndex && previous.stop === visibleStopIndex) {
          return previous;
        }
        return { start: visibleStartIndex, stop: visibleStopIndex };
      });
    },
    []
  );

  const InnerElement = useMemo(
    () =>
      forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>((props, ref) => {
        const combinedClassName = [className, props.className].filter(Boolean).join(' ');
        return <ul {...props} ref={ref} role={role} className={combinedClassName} />;
      }),
    [className, role]
  );
  InnerElement.displayName = 'ClipListInner';

  const itemCount = clips.length;
  const baselineHeight = measuredItemHeight ?? estimatedItemHeight;
  const visibleCount = Math.min(Math.max(itemCount, 1), maxVisibleItems);
  const listHeight = visibleCount * baselineHeight;

  if (itemCount === 0) {
    return null;
  }

  return (
    <VariableSizeList<ClipListItemData<TItem, TItemData>>
      ref={listRef}
      height={listHeight}
      itemCount={itemCount}
      itemSize={getSize}
      width="100%"
      overscanCount={overscanCount}
      itemData={itemDataWithState}
      itemKey={(index) => {
        const clip = clips[index];
        const key = clip ? getItemKey(clip) : index;
        return typeof key === 'number' ? key : `${key}`;
      }}
      innerElementType={InnerElement}
      onItemsRendered={handleItemsRendered}
      style={{ overflowX: 'hidden' }}
    >
      {(props) => <ClipListItem<TItem, TItemData> {...props} />}
    </VariableSizeList>
  );
};

export default ClipList;
