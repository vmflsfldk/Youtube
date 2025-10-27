import { useMemo, useState } from 'react';
import type { AriaAttributes } from 'react';

import { DEFAULT_LOCALE } from '../contexts/LanguageContext';
import { translate, useTranslations } from '../locales/translations';

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
  clipValue: string;
};

export type CatalogFallbacks = {
  artist: string;
  composer: string;
  song: string;
  clip: string;
};

const DEFAULT_CATALOG_FALLBACKS: CatalogFallbacks = {
  artist: translate(DEFAULT_LOCALE, 'catalog.fallback.artist'),
  composer: translate(DEFAULT_LOCALE, 'catalog.fallback.composer'),
  song: translate(DEFAULT_LOCALE, 'catalog.fallback.song'),
  clip: translate(DEFAULT_LOCALE, 'catalog.fallback.clip')
};

const normalize = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

export const buildCatalogRecords = (
  clips: SongCatalogClip[],
  videos: SongCatalogVideo[],
  songs: SongCatalogVideo[] = [],
  fallbacks: CatalogFallbacks = DEFAULT_CATALOG_FALLBACKS
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
      artist: artistValue || fallbacks.artist,
      composer: composerValue || fallbacks.composer,
      songTitle: primaryTitle || fallbacks.song,
      clipTitle: secondaryTitle || primaryTitle || fallbacks.clip,
      artistValue,
      composerValue,
      songValue: primaryTitle,
      clipValue: secondaryTitle || primaryTitle || ''
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
        artist: artistValue || fallbacks.artist,
        composer: composerValue || fallbacks.composer,
        songTitle: songTitleValue || fallbacks.song,
        clipTitle: songTitleValue || fallbacks.clip,
        artistValue,
        composerValue,
        songValue: songTitleValue,
        clipValue: songTitleValue
      } satisfies CatalogDisplayRecord;
    });

  return [...clipRecords, ...songRecords];
};

export type CatalogFilterField = 'song' | 'artist' | 'composer';

export type CatalogFilter = {
  field: CatalogFilterField;
  query: string;
};

const matchesFilter = (value: string, query: string): boolean => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return true;
  }
  return value.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase());
};

const getRecordValueForField = (record: CatalogDisplayRecord, field: CatalogFilterField): string => {
  switch (field) {
    case 'artist':
      return record.artist;
    case 'composer':
      return record.composer;
    case 'song':
    default:
      return record.songTitle;
  }
};

export const filterCatalogRecords = (
  records: CatalogDisplayRecord[],
  { field, query }: CatalogFilter
): CatalogDisplayRecord[] => {
  if (!query.trim()) {
    return records;
  }

  return records.filter((record) => matchesFilter(getRecordValueForField(record, field), query));
};

export type CatalogSortKey = 'song' | 'clip' | 'artist' | 'composer';

export type CatalogSortDirection = 'asc' | 'desc';

export type CatalogSort = {
  key: CatalogSortKey;
  direction: CatalogSortDirection;
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const getSortValue = (record: CatalogDisplayRecord, key: CatalogSortKey): string => {
  switch (key) {
    case 'clip':
      return record.clipValue || record.clipTitle;
    case 'artist':
      return record.artistValue || record.artist;
    case 'composer':
      return record.composerValue || record.composer;
    case 'song':
    default:
      return record.songValue || record.songTitle;
  }
};

export const sortCatalogRecords = (
  records: CatalogDisplayRecord[],
  { key, direction }: CatalogSort
): CatalogDisplayRecord[] => {
  const factor = direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const valueA = getSortValue(a, key);
    const valueB = getSortValue(b, key);
    const comparison = collator.compare(valueA, valueB);
    if (comparison !== 0) {
      return comparison * factor;
    }
    // Fall back to consistent ordering by song title then id to keep sort stable.
    const songComparison = collator.compare(a.songValue || a.songTitle, b.songValue || b.songTitle);
    if (songComparison !== 0) {
      return songComparison * factor;
    }
    return (a.id - b.id) * factor;
  });
};

const SongCatalogTable = ({ clips, videos, songs = [] }: SongCatalogTableProps) => {
  const translateText = useTranslations();

  const fallbacks = useMemo(
    () => ({
      artist: translateText('catalog.fallback.artist'),
      composer: translateText('catalog.fallback.composer'),
      song: translateText('catalog.fallback.song'),
      clip: translateText('catalog.fallback.clip')
    }),
    [translateText]
  );

  const records = useMemo(
    () => buildCatalogRecords(clips, videos, songs, fallbacks),
    [clips, fallbacks, songs, videos]
  );

  const [selectedField, setSelectedField] = useState<CatalogFilterField>('song');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<CatalogSort>({ key: 'song', direction: 'asc' });

  const filteredRecords = useMemo(
    () => filterCatalogRecords(records, { field: selectedField, query: searchQuery }),
    [records, searchQuery, selectedField]
  );

  const sortedRecords = useMemo(
    () => sortCatalogRecords(filteredRecords, sortState),
    [filteredRecords, sortState]
  );

  const updateSort = (key: CatalogSortKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const getAriaSort = (key: CatalogSortKey): AriaAttributes['aria-sort'] => {
    if (sortState.key !== key) {
      return 'none';
    }
    return sortState.direction === 'asc' ? 'ascending' : 'descending';
  };

  if (records.length === 0) {
    return (
      <div className="catalog-panel__status" role="status" aria-live="polite">
        {translateText('catalog.noRecords')}
      </div>
    );
  }

  return (
    <div className="song-catalog">
      <div
        className="song-catalog__filters"
        role="search"
        aria-label={translateText('catalog.filtersAriaLabel')}
      >
        <div className="song-catalog__filter">
          <label className="song-catalog__filter-label" htmlFor="catalog-filter-field">
            {translateText('catalog.filters.fieldLabel')}
          </label>
          <select
            id="catalog-filter-field"
            className="song-catalog__filter-select"
            value={selectedField}
            onChange={(event) => setSelectedField(event.target.value as CatalogFilterField)}
          >
            <option value="song">{translateText('catalog.filters.fieldOption.song')}</option>
            <option value="artist">{translateText('catalog.filters.fieldOption.artist')}</option>
            <option value="composer">{translateText('catalog.filters.fieldOption.composer')}</option>
          </select>
        </div>
        <div className="song-catalog__filter">
          <label className="song-catalog__filter-label" htmlFor="catalog-filter-query">
            {translateText('catalog.filters.queryLabel')}
          </label>
          <input
            id="catalog-filter-query"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={translateText('catalog.filters.queryPlaceholder')}
            className="song-catalog__filter-input"
          />
        </div>
      </div>

      <div
        className="song-catalog__table-wrapper"
        role="region"
        aria-live="polite"
        aria-label={translateText('catalog.regionAriaLabel')}
      >
        {filteredRecords.length === 0 ? (
          <div className="catalog-panel__status">{translateText('catalog.noMatches')}</div>
        ) : (
          <table className="song-catalog__table">
            <caption className="visually-hidden">{translateText('catalog.tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={getAriaSort('song')}>
                  <button
                    type="button"
                    className="song-catalog__sort-button"
                    onClick={() => updateSort('song')}
                  >
                    {translateText('catalog.columns.song')}
                    <span aria-hidden="true" className="song-catalog__sort-indicator">
                      {sortState.key === 'song' ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('clip')}>
                  <button
                    type="button"
                    className="song-catalog__sort-button"
                    onClick={() => updateSort('clip')}
                  >
                    {translateText('catalog.columns.clip')}
                    <span aria-hidden="true" className="song-catalog__sort-indicator">
                      {sortState.key === 'clip' ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('artist')}>
                  <button
                    type="button"
                    className="song-catalog__sort-button"
                    onClick={() => updateSort('artist')}
                  >
                    {translateText('catalog.columns.artist')}
                    <span aria-hidden="true" className="song-catalog__sort-indicator">
                      {sortState.key === 'artist' ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort('composer')}>
                  <button
                    type="button"
                    className="song-catalog__sort-button"
                    onClick={() => updateSort('composer')}
                  >
                    {translateText('catalog.columns.composer')}
                    <span aria-hidden="true" className="song-catalog__sort-indicator">
                      {sortState.key === 'composer' ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((record) => (
                <tr key={record.id}>
                  <td data-title={translateText('catalog.columns.song')}>{record.songTitle}</td>
                  <td data-title={translateText('catalog.columns.clip')}>{record.clipTitle}</td>
                  <td data-title={translateText('catalog.columns.artist')}>{record.artist}</td>
                  <td data-title={translateText('catalog.columns.composer')}>{record.composer}</td>
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
