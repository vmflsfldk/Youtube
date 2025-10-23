import { useMemo, useState } from 'react';

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

const FALLBACK_ARTIST = '표기되지 않은 아티스트';
const FALLBACK_COMPOSER = '표기되지 않은 원곡자';
const FALLBACK_SONG = '곡 제목 미정';
const FALLBACK_CLIP = '클립 제목 미정';

const normalize = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

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

export type CatalogFilters = {
  artist?: string;
  composer?: string;
  song?: string;
};

const matchesFilter = (value: string, query: string): boolean => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return true;
  }
  return value.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase());
};

export const filterCatalogRecords = (
  records: CatalogDisplayRecord[],
  { artist = '', composer = '', song = '' }: CatalogFilters
): CatalogDisplayRecord[] => {
  if (!artist && !composer && !song) {
    return records;
  }

  return records.filter((record) => {
    return (
      matchesFilter(record.artist, artist) &&
      matchesFilter(record.composer, composer) &&
      matchesFilter(record.songTitle, song)
    );
  });
};

const SongCatalogTable = ({ clips, videos, songs = [] }: SongCatalogTableProps) => {
  const records = useMemo(() => buildCatalogRecords(clips, videos, songs), [clips, songs, videos]);

  const [artistFilter, setArtistFilter] = useState('');
  const [composerFilter, setComposerFilter] = useState('');
  const [songFilter, setSongFilter] = useState('');

  const filteredRecords = useMemo(
    () => filterCatalogRecords(records, { artist: artistFilter, composer: composerFilter, song: songFilter }),
    [records, artistFilter, composerFilter, songFilter]
  );

  if (records.length === 0) {
    return (
      <div className="catalog-panel__status" role="status" aria-live="polite">
        표시할 곡이 없습니다.
      </div>
    );
  }

  return (
    <div className="song-catalog">
      <div className="song-catalog__filters" role="search" aria-label="곡 필터">
        <div className="song-catalog__filter">
          <label className="song-catalog__filter-label" htmlFor="song-filter">
            곡 제목
          </label>
          <input
            id="song-filter"
            type="search"
            value={songFilter}
            onChange={(event) => setSongFilter(event.target.value)}
            placeholder="곡 제목 검색"
            className="song-catalog__filter-input"
          />
        </div>
        <div className="song-catalog__filter">
          <label className="song-catalog__filter-label" htmlFor="artist-filter">
            아티스트
          </label>
          <input
            id="artist-filter"
            type="search"
            value={artistFilter}
            onChange={(event) => setArtistFilter(event.target.value)}
            placeholder="아티스트 검색"
            className="song-catalog__filter-input"
          />
        </div>
        <div className="song-catalog__filter">
          <label className="song-catalog__filter-label" htmlFor="composer-filter">
            원곡자
          </label>
          <input
            id="composer-filter"
            type="search"
            value={composerFilter}
            onChange={(event) => setComposerFilter(event.target.value)}
            placeholder="원곡자 검색"
            className="song-catalog__filter-input"
          />
        </div>
      </div>

      <div className="song-catalog__table-wrapper" role="region" aria-live="polite" aria-label="곡 카탈로그">
        {filteredRecords.length === 0 ? (
          <div className="catalog-panel__status">조건에 맞는 곡이 없습니다.</div>
        ) : (
          <table className="song-catalog__table">
            <caption className="visually-hidden">곡 카탈로그</caption>
            <thead>
              <tr>
                <th scope="col">곡 제목</th>
                <th scope="col">클립/영상</th>
                <th scope="col">아티스트</th>
                <th scope="col">원곡자</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td data-title="곡 제목">{record.songTitle}</td>
                  <td data-title="클립/영상">{record.clipTitle}</td>
                  <td data-title="아티스트">{record.artist}</td>
                  <td data-title="원곡자">{record.composer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SongCatalogTable;
