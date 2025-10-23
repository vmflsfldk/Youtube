import { Fragment, useMemo, useState } from 'react';

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

type CatalogGrouping = 'artist' | 'composer' | 'title';

type CatalogDisplayRecord = {
  id: number;
  artist: string;
  composer: string;
  songTitle: string;
  clipTitle: string;
  artistValue: string;
  composerValue: string;
  songValue: string;
};

const GROUP_OPTIONS: Array<{ key: CatalogGrouping; label: string }> = [
  { key: 'artist', label: '아티스트' },
  { key: 'composer', label: '원곡자' },
  { key: 'title', label: '곡 제목' }
];

const FALLBACK_ARTIST = '표기되지 않은 아티스트';
const FALLBACK_COMPOSER = '표기되지 않은 원곡자';
const FALLBACK_SONG = '곡 제목 미정';
const FALLBACK_CLIP = '클립 제목 미정';

const GROUP_FALLBACK_LABEL: Record<CatalogGrouping, string> = {
  artist: FALLBACK_ARTIST,
  composer: FALLBACK_COMPOSER,
  title: FALLBACK_SONG
};

const normalize = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

const localeCompare = (a: string, b: string) => a.localeCompare(b, 'ko', { sensitivity: 'base', numeric: true });

const SongCatalogTable = ({ clips, videos, songs = [] }: SongCatalogTableProps) => {
  const [groupBy, setGroupBy] = useState<CatalogGrouping>('artist');

  const videoMap = useMemo(() => {
    const map = new Map<number, SongCatalogVideo>();
    videos.forEach((video) => {
      map.set(video.id, video);
    });
    return map;
  }, [videos]);

  const records = useMemo<CatalogDisplayRecord[]>(() => {
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
      };
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
  }, [clips, songs, videoMap]);

  const groupedRecords = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        sortKey: string;
        items: CatalogDisplayRecord[];
      }
    >();
    const fallbackLabel = GROUP_FALLBACK_LABEL[groupBy];

    const rowSorter: Record<CatalogGrouping, (a: CatalogDisplayRecord, b: CatalogDisplayRecord) => number> = {
      artist: (a, b) =>
        localeCompare(a.songTitle, b.songTitle) || localeCompare(a.clipTitle, b.clipTitle),
      composer: (a, b) =>
        localeCompare(a.artist, b.artist) || localeCompare(a.songTitle, b.songTitle),
      title: (a, b) =>
        localeCompare(a.artist, b.artist) || localeCompare(a.clipTitle, b.clipTitle)
    };

    records.forEach((record) => {
      const rawValue =
        groupBy === 'artist'
          ? record.artistValue
          : groupBy === 'composer'
            ? record.composerValue
            : record.songValue;
      const label = rawValue || fallbackLabel;
      const sortKey = rawValue ? rawValue : `\uffff${fallbackLabel}`;
      const existing = groups.get(label);
      if (existing) {
        existing.items.push(record);
      } else {
        groups.set(label, {
          label,
          sortKey,
          items: [record]
        });
      }
    });

    return Array.from(groups.values())
      .sort((a, b) => localeCompare(a.sortKey, b.sortKey))
      .map((group) => ({
        ...group,
        items: group.items.slice().sort(rowSorter[groupBy])
      }));
  }, [groupBy, records]);

  if (groupedRecords.length === 0) {
    return (
      <div className="catalog-panel__status" role="status" aria-live="polite">
        표시할 곡이 없습니다.
      </div>
    );
  }

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
      <div className="song-catalog__table-wrapper">
        <table className="song-catalog__table">
          <thead>
            <tr>
              <th scope="col">아티스트</th>
              <th scope="col">원곡자</th>
              <th scope="col">곡 제목</th>
              <th scope="col">클립 제목</th>
            </tr>
          </thead>
          <tbody>
            {groupedRecords.map((group) => (
              <Fragment key={group.label}>
                <tr className="song-catalog__group-row">
                  <th scope="colgroup" colSpan={4}>
                    <span className="song-catalog__group-name">{group.label}</span>
                    <span className="song-catalog__group-count">{group.items.length}곡</span>
                  </th>
                </tr>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td data-title="아티스트">{item.artist}</td>
                    <td data-title="원곡자">{item.composer}</td>
                    <td data-title="곡 제목">{item.songTitle}</td>
                    <td data-title="클립 제목">{item.clipTitle}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SongCatalogTable;
