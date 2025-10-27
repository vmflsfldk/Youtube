import { useMemo } from 'react';

import type { ArtistSearchMode } from '../App';
import { useTranslations } from '../locales/translations';

type ArtistSearchControlsProps = {
  query: string;
  mode: ArtistSearchMode;
  onQueryChange: (value: string) => void;
  onModeChange: (mode: ArtistSearchMode) => void;
  onClear: () => void;
};

const ArtistSearchControls = ({
  query,
  mode,
  onQueryChange,
  onModeChange,
  onClear
}: ArtistSearchControlsProps) => {
  const translate = useTranslations();

  const modeOptions = useMemo(
    () => [
      { value: 'all' as const, label: translate('artistSearch.mode.all') },
      { value: 'name' as const, label: translate('artistSearch.mode.name') },
      { value: 'tag' as const, label: translate('artistSearch.mode.tag') }
    ],
    [translate]
  );

  return (
    <div className="artist-search-controls">
      <label htmlFor="artistDirectorySearch">{translate('artistSearch.label')}</label>
      <div className="artist-search-controls__input-row">
        <div className="artist-directory__search-input-wrapper">
          <input
            id="artistDirectorySearch"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={translate('artistSearch.placeholder')}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="artist-directory__search-clear"
              onClick={onClear}
              aria-label={translate('artistSearch.clearAria')}
            >
              {translate('artistSearch.clear')}
            </button>
          )}
        </div>
        <div
          className="artist-search-controls__mode-toggle"
          role="group"
          aria-label={translate('artistSearch.modeGroupLabel')}
        >
          {modeOptions.map((option) => {
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
