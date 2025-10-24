import { memo, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface ArtistCountryBadge {
  code: string;
  label: string;
}

export interface ArtistLibraryCardData {
  fallbackAvatarUrl: string;
  countryBadges: ArtistCountryBadge[];
  agency: string;
  tags: string[];
  displayName: string;
}

interface ArtistLibraryCardArtist {
  displayName: string;
  name: string;
  youtubeChannelTitle?: string | null;
  youtubeChannelId: string;
  profileImageUrl?: string | null;
}

interface ArtistLibraryCardProps {
  artist: ArtistLibraryCardArtist;
  isActive?: boolean;
  interactive?: boolean;
  focusMode?: boolean;
  onSelect?: () => void;
  cardData: ArtistLibraryCardData;
  showTags?: boolean;
}

const ArtistLibraryCardComponent = ({
  artist,
  isActive = false,
  interactive = true,
  focusMode = false,
  onSelect,
  cardData,
  showTags = true
}: ArtistLibraryCardProps) => {
  const classNames = ['artist-library__card'];
  if (isActive) {
    classNames.push('selected');
  }
  if (focusMode) {
    classNames.push('artist-library__card--focused');
  }

  const handleClick = interactive
    ? () => {
        onSelect?.();
      }
    : undefined;

  const handleKeyDown = interactive
    ? (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.();
        }
      }
    : undefined;

  const {
    fallbackAvatarUrl,
    countryBadges,
    agency,
    tags,
    displayName
  } = cardData;
  const resolvedName = displayName || artist.displayName || artist.name;

  const normalizedChannelHandle = (() => {
    const candidate = artist.youtubeChannelId.startsWith('@')
      ? artist.youtubeChannelId
      : artist.youtubeChannelTitle || artist.youtubeChannelId || '';
    if (candidate.startsWith('@')) {
      return candidate;
    }
    const compact = candidate.replace(/\s+/g, '');
    if (/^UC[0-9A-Za-z_-]{22}$/.test(compact)) {
      return `@${resolvedName.replace(/\s+/g, '')}`;
    }
    return compact.length > 0 ? `@${compact}` : `@${resolvedName.replace(/\s+/g, '')}`;
  })();
  const agencyLabel = agency && agency.trim().length > 0 ? agency : '독립';
  const languageLabel = countryBadges.length > 0
    ? countryBadges.map((badge) => badge.code).join(' · ')
    : 'GLOBAL';
  const formatTagsSummary = (values: string[]): string => {
    if (values.length === 0) {
      return '태그 없음';
    }
    if (values.length <= 2) {
      return values.join(' · ');
    }
    const remaining = values.length - 2;
    return `${values.slice(0, 2).join(' · ')} 외 ${remaining}`;
  };
  const tagsSummary = formatTagsSummary(tags);
  const mobileStats: { key: string; label: string; value: string }[] = [
    { key: 'agency', label: '소속', value: agencyLabel },
    { key: 'language', label: '언어', value: languageLabel },
    { key: 'tags', label: '태그', value: tagsSummary }
  ];
  if (tags.length > 0) {
    mobileStats.push({ key: 'tagCount', label: '태그 수', value: `${tags.length}개` });
  }

  const shouldShowTags = showTags && tags.length > 0;
  const hasMetaContent = Boolean(agency || shouldShowTags);

  return (
    <div
      className={classNames.join(' ')}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? isActive : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="artist-library__avatar">
        {artist.profileImageUrl ? (
          <img
            src={artist.profileImageUrl}
            alt={`${resolvedName} 채널 프로필 이미지`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
              if (event.currentTarget.src !== fallbackAvatarUrl) {
                event.currentTarget.src = fallbackAvatarUrl;
              }
            }}
          />
        ) : (
          <img
            src={fallbackAvatarUrl}
            alt={`${resolvedName} 기본 프로필 이미지`}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div className="artist-library__info">
        <div className="artist-library__primary">
          <span className="artist-library__name">{resolvedName}</span>
          <span className="artist-library__channel">{normalizedChannelHandle}</span>
        </div>
        <div className="artist-library__mobile-stats">
          {mobileStats.map((stat) => (
            <div key={stat.key} className="artist-library__stat" aria-label={`${stat.label} ${stat.value}`}>
              <span className="artist-library__stat-label">{stat.label}</span>
              <span className="artist-library__stat-value">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
      {hasMetaContent && (
        <div className="artist-library__meta">
          {agency && <span className="artist-library__agency">{agency}</span>}
          {shouldShowTags && (
            <div className="artist-library__tags">
              {tags.map((tag) => (
                <span key={tag} className="artist-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {countryBadges.length > 0 && (
        <div className="artist-library__countries">
          {countryBadges.map((badge) => (
            <span key={badge.code} className="artist-country-badge">
              <span className="artist-country-badge__code">{badge.code}</span>
              {badge.label}
            </span>
          ))}
        </div>
      )}
      {artist.youtubeChannelId && (
        <a
          className="artist-library__link"
          href={
            artist.youtubeChannelId.startsWith('@')
              ? `https://www.youtube.com/${artist.youtubeChannelId}`
              : `https://www.youtube.com/channel/${artist.youtubeChannelId}`
          }
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (interactive) {
              event.stopPropagation();
            }
          }}
        >
          유튜브 채널 보기
        </a>
      )}
    </div>
  );
};

const ArtistLibraryCard = memo(ArtistLibraryCardComponent);
ArtistLibraryCard.displayName = 'ArtistLibraryCard';

export default ArtistLibraryCard;
