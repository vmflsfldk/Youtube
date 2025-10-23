import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type SongCatalogClip = {
  id: number;
  title: string;
  videoId: number;
  videoTitle?: string | null;
  originalComposer?: string | null;
  videoOriginalComposer?: string | null;
  artistDisplayName?: string | null;
  artistName?: string | null;
};

type SongCatalogVideo = {
  id: number;
  title: string;
  originalComposer?: string | null;
  artistDisplayName?: string | null;
  artistName?: string | null;
  contentType?: 'OFFICIAL' | 'CLIP_SOURCE' | string;
  category?: 'live' | 'cover' | 'original' | string | null;
};

interface SongCatalogTableProps {
  clips: SongCatalogClip[];
  videos: SongCatalogVideo[];
  songs?: SongCatalogVideo[];
}

export type CatalogGrouping =
  | 'artist'
  | 'composer'
  | 'title'
  | 'artist-composer'
  | 'artist-song'
  | 'song-artist'
  | 'composer-song';

export type CatalogDisplayRecord = {
  id: number;
  artist: string;
  composer: string;
  songTitle: string;
  clipTitle: string;
  artistValue: string;
  composerValue: string;
  songValue: string;
};

type NodeType = 'artist' | 'composer' | 'song' | 'clip';

export type CatalogTreeNode = {
  id: string;
  type: NodeType;
  label: string;
  count: number;
  children: CatalogTreeNode[];
  record?: CatalogDisplayRecord;
};

const GROUP_OPTIONS: Array<{ key: CatalogGrouping; label: string }> = [
  { key: 'artist', label: '아티스트' },
  { key: 'composer', label: '원곡자' },
  { key: 'title', label: '곡 제목' },
  { key: 'artist-composer', label: '아티스트 → 원곡자' },
  { key: 'artist-song', label: '아티스트 → 곡 제목' },
  { key: 'song-artist', label: '곡 제목 → 아티스트' },
  { key: 'composer-song', label: '원곡자 → 곡 제목' }
];

const FALLBACK_ARTIST = '표기되지 않은 아티스트';
const FALLBACK_COMPOSER = '표기되지 않은 원곡자';
const FALLBACK_SONG = '곡 제목 미정';
const FALLBACK_CLIP = '클립 제목 미정';

const normalize = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

const localeCompare = (a: string, b: string) => a.localeCompare(b, 'ko', { sensitivity: 'base', numeric: true });

const GROUP_ORDER: Record<CatalogGrouping, NodeType[]> = {
  artist: ['artist', 'composer', 'song', 'clip'],
  composer: ['composer', 'artist', 'song', 'clip'],
  title: ['song', 'artist', 'composer', 'clip'],
  'artist-composer': ['artist', 'composer', 'clip'],
  'artist-song': ['artist', 'song', 'clip'],
  'song-artist': ['song', 'artist', 'clip'],
  'composer-song': ['composer', 'song', 'clip']
};

const sanitizeKey = (value: string): string => value.replace(/[^a-z0-9]+/gi, '-');

const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

type MutableNode = {
  id: string;
  type: NodeType;
  label: string;
  sortKey: string;
  count: number;
  childrenMap?: Map<string, MutableNode>;
  record?: CatalogDisplayRecord;
};

type MutableRoot = {
  childrenMap: Map<string, MutableNode>;
};

const ensureChildNode = (
  parent: MutableRoot | MutableNode,
  type: Exclude<NodeType, 'clip'>,
  label: string,
  rawValue: string,
  fallbackLabel: string,
  parentId: string | null
): MutableNode => {
  if (!parent.childrenMap) {
    parent.childrenMap = new Map();
  }
  const key = rawValue || `__fallback__${type}`;
  const existing = parent.childrenMap.get(key);
  if (existing) {
    return existing;
  }
  const sortKey = rawValue ? rawValue : `\uffff${fallbackLabel}`;
  const idSuffix = hashString(`${type}:${key}`) || sanitizeKey(label) || 'node';
  const id = parentId ? `${parentId}__${type}-${idSuffix}` : `${type}-${idSuffix}`;
  const node: MutableNode = {
    id,
    type,
    label,
    sortKey,
    count: 0,
    childrenMap: new Map()
  };
  parent.childrenMap.set(key, node);
  return node;
};

const createClipNode = (parent: MutableNode, record: CatalogDisplayRecord): MutableNode => {
  if (!parent.childrenMap) {
    parent.childrenMap = new Map();
  }
  const key = `clip:${record.id}`;
  const existing = parent.childrenMap.get(key);
  if (existing) {
    return existing;
  }
  const sortKey = record.clipTitle ? record.clipTitle : `\uffff${FALLBACK_CLIP}`;
  const node: MutableNode = {
    id: `${parent.id}__clip-${record.id}`,
    type: 'clip',
    label: record.clipTitle,
    sortKey,
    count: 1,
    record
  };
  parent.childrenMap.set(key, node);
  return node;
};

const finalizeNodes = (map?: Map<string, MutableNode>): CatalogTreeNode[] => {
  if (!map) {
    return [];
  }
  return Array.from(map.values())
    .sort((a, b) => localeCompare(a.sortKey, b.sortKey))
    .map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      count: node.type === 'clip' ? 1 : node.count,
      children: finalizeNodes(node.childrenMap),
      record: node.record
    }));
};

const collectNonLeafIds = (nodes: CatalogTreeNode[], acc: string[]) => {
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      acc.push(node.id);
      collectNonLeafIds(node.children, acc);
    }
  });
};

export const buildCatalogRecords = (
  clips: SongCatalogClip[],
  videos: SongCatalogVideo[],
  songs: SongCatalogVideo[] = []
): CatalogDisplayRecord[] => {
  const videoMap = new Map<number, SongCatalogVideo>();
  videos.forEach((video) => {
    videoMap.set(video.id, video);
  });

  const clipRecords = clips.map((clip) => {
    const video = videoMap.get(clip.videoId) ?? null;
    const artistValue =
      normalize(clip.artistDisplayName) ||
      normalize(clip.artistName) ||
      normalize(video?.artistDisplayName) ||
      normalize(video?.artistName) ||
      '';
    const composerValue =
      normalize(clip.originalComposer) ||
      normalize(clip.videoOriginalComposer) ||
      normalize(video?.originalComposer) ||
      '';
    const videoTitleValue = normalize(clip.videoTitle) || normalize(video?.title) || '';
    const clipTitleValue = normalize(clip.title);
    const isClipSource = video?.contentType === 'CLIP_SOURCE';
    const primaryTitle = isClipSource ? clipTitleValue : videoTitleValue;
    const secondaryTitle = isClipSource ? videoTitleValue : clipTitleValue;

    return {
      id: clip.id,
      artist: artistValue || FALLBACK_ARTIST,
      composer: composerValue || FALLBACK_COMPOSER,
      songTitle: primaryTitle || FALLBACK_SONG,
      clipTitle: secondaryTitle || primaryTitle || FALLBACK_CLIP,
      artistValue,
      composerValue,
      songValue: primaryTitle
    } satisfies CatalogDisplayRecord;
  });

  const songRecords = songs
    .filter((song) => {
      const contentType = (song.contentType ?? '').toUpperCase();
      if (contentType === 'CLIP_SOURCE') {
        return false;
      }
      const category = (song.category ?? '').toLowerCase();
      if (category === 'live') {
        return false;
      }
      return true;
    })
    .map((song) => {
      const artistValue = normalize(song.artistDisplayName) || normalize(song.artistName) || '';
      const composerValue = normalize(song.originalComposer) || '';
      const songTitleValue = normalize(song.title);

      return {
        id: -Math.abs(song.id),
        artist: artistValue || FALLBACK_ARTIST,
        composer: composerValue || FALLBACK_COMPOSER,
        songTitle: songTitleValue || FALLBACK_SONG,
        clipTitle: songTitleValue || FALLBACK_CLIP,
        artistValue,
        composerValue,
        songValue: songTitleValue
      } satisfies CatalogDisplayRecord;
    });

  return [...clipRecords, ...songRecords];
};

export const buildCatalogTree = (
  records: CatalogDisplayRecord[],
  groupBy: CatalogGrouping
): { nodes: CatalogTreeNode[]; nonLeafIds: string[] } => {
  if (records.length === 0) {
    return { nodes: [], nonLeafIds: [] };
  }

  const root: MutableRoot = { childrenMap: new Map() };
  const order = GROUP_ORDER[groupBy];

  records.forEach((record) => {
    const path: MutableNode[] = [];
    order.forEach((type) => {
      if (type === 'clip') {
        const parentNode = path[path.length - 1];
        if (!parentNode) {
          return;
        }
        const clipNode = createClipNode(parentNode, record);
        path.forEach((node) => {
          node.count += 1;
        });
        path.push(clipNode);
        return;
      }

      const fallbackLabel =
        type === 'artist' ? FALLBACK_ARTIST : type === 'composer' ? FALLBACK_COMPOSER : FALLBACK_SONG;
      const rawValue =
        type === 'artist'
          ? record.artistValue
          : type === 'composer'
            ? record.composerValue
            : record.songValue;
      const label =
        type === 'artist'
          ? record.artist
          : type === 'composer'
            ? record.composer
            : record.songTitle;
      const parent = path[path.length - 1] ?? root;
      const parentId = path[path.length - 1]?.id ?? null;
      const node = ensureChildNode(parent, type, label, rawValue, fallbackLabel, parentId);
      path.push(node);
    });
  });

  const nodes = finalizeNodes(root.childrenMap);
  const nonLeafIds: string[] = [];
  collectNonLeafIds(nodes, nonLeafIds);

  return { nodes, nonLeafIds };
};

const SongCatalogTable = ({ clips, videos, songs = [] }: SongCatalogTableProps) => {
  const [groupBy, setGroupBy] = useState<CatalogGrouping>('artist');

  const records = useMemo(() => buildCatalogRecords(clips, videos, songs), [clips, songs, videos]);
  const { nodes: treeNodes, nonLeafIds } = useMemo(
    () => buildCatalogTree(records, groupBy),
    [records, groupBy]
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(nonLeafIds));

  useEffect(() => {
    setExpandedIds(new Set(nonLeafIds));
  }, [nonLeafIds, groupBy]);

  if (records.length === 0) {
    return (
      <div className="catalog-panel__status" role="status" aria-live="polite">
        표시할 곡이 없습니다.
      </div>
    );
  }

  const toggleNode = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNode = (node: CatalogTreeNode, depth: number): JSX.Element => {
    const isLeaf = node.children.length === 0;
    const isExpanded = expandedIds.has(node.id);
    const ariaExpanded = !isLeaf ? isExpanded : undefined;

    return (
      <li
        key={node.id}
        role="treeitem"
        aria-expanded={ariaExpanded}
        className={`song-catalog__tree-item song-catalog__tree-item--${node.type}`}
        style={{ '--node-depth': depth } as CSSProperties}
      >
        <div className="song-catalog__node">
          {!isLeaf ? (
            <button
              type="button"
              className={`song-catalog__toggle${isExpanded ? ' is-expanded' : ''}`}
              onClick={() => toggleNode(node.id)}
              aria-controls={`${node.id}-group`}
              aria-label={`${isExpanded ? '접기' : '펼치기'} ${node.label}`}
            >
              <span aria-hidden="true" />
            </button>
          ) : (
            <span className="song-catalog__toggle song-catalog__toggle--placeholder" aria-hidden="true" />
          )}
          <div className="song-catalog__node-body">
            <div className="song-catalog__node-header">
              <span className="song-catalog__node-label">{node.label}</span>
              {node.type !== 'clip' ? (
                <span className="song-catalog__node-count" aria-label={`포함된 곡 ${node.count}개`}>
                  {node.count}곡
                </span>
              ) : null}
            </div>
            {node.type === 'clip' && node.record ? (
              <dl className="song-catalog__clip-details">
                <div>
                  <dt>곡 제목</dt>
                  <dd>{node.record.songTitle}</dd>
                </div>
                <div>
                  <dt>원곡자</dt>
                  <dd>{node.record.composer}</dd>
                </div>
                <div>
                  <dt>아티스트</dt>
                  <dd>{node.record.artist}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>
        {!isLeaf && isExpanded ? (
          <ul role="group" id={`${node.id}-group`} className="song-catalog__tree-group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="song-catalog">
      <div className="song-catalog__controls" role="toolbar" aria-label="곡 그룹 기준">
        <span className="song-catalog__controls-label">그룹 기준</span>
        <div className="song-catalog__segmented" role="group" aria-label="그룹 기준 선택">
          {GROUP_OPTIONS.map((option) => {
            const isActive = groupBy === option.key;
            return (
              <button
                key={option.key}
                type="button"
                className={`song-catalog__segmented-button${isActive ? ' is-active' : ''}`}
                onClick={() => setGroupBy(option.key)}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="song-catalog__tree-wrapper">
        <ul className="song-catalog__tree" role="tree" aria-label="곡 카탈로그">
          {treeNodes.map((node) => renderNode(node, 0))}
        </ul>
      </div>
    </div>
  );
};

export default SongCatalogTable;
