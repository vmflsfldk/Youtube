import type { ArtistSearchMode } from '../App';

type ArtistSearchControlsProps = {
  query: string;
  mode: ArtistSearchMode;
  onQueryChange: (value: string) => void;
  onModeChange: (mode: ArtistSearchMode) => void;
  onClear: () => void;
};

const MODE_OPTIONS: Array<{ value: ArtistSearchMode; label: string }> = [
  { value: 'all', label: '모두' },
  { value: 'name', label: '이름' },
  { value: 'tag', label: '태그' }
];

const ArtistSearchControls = ({
  query,
  mode,
  onQueryChange,
  onModeChange,
  onClear
}: ArtistSearchControlsProps) => {
  return (
    <div className="artist-search-controls">
      <label htmlFor="artistDirectorySearch">아티스트 검색</label>
      <div className="artist-search-controls__input-row">
        <div className="artist-directory__search-input-wrapper">
          <input
            id="artistDirectorySearch"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="이름, 채널 또는 태그 검색"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="artist-directory__search-clear"
              onClick={onClear}
              aria-label="검색어 지우기"
            >
              지우기
            </button>
          )}
        </div>
        <div className="artist-search-controls__mode-toggle" role="group" aria-label="검색 범위">
          {MODE_OPTIONS.map((option) => {
            const buttonClassName = [
              'artist-search-controls__mode-button',
              option.value === mode ? 'artist-search-controls__mode-button--active' : null
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={option.value}
                type="button"
                className={buttonClassName}
                onClick={() => onModeChange(option.value)}
                aria-pressed={option.value === mode}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ArtistSearchControls;
