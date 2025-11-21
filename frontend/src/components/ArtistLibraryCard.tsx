import { memo, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

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
  chzzkChannelId?: string | null;
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

  const shouldShowTags = showTags && tags.length > 0;
  const hasMetaContent = Boolean(agency || shouldShowTags);

  const resolvedName = displayName || artist.displayName || artist.name;

  const [isChzzkLive, setIsChzzkLive] = useState(false);

  useEffect(() => {
    const channelId = artist.chzzkChannelId?.trim();

    if (!channelId) {
      setIsChzzkLive(false);
      return;
    }

    const controller = new AbortController();

    const checkChzzkLive = async () => {
      try {
        const response = await fetch(`/api/chzzk/status?channelId=${encodeURIComponent(channelId)}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { isLive?: boolean };
        setIsChzzkLive(Boolean(data?.isLive));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('치지직 확인 실패', error);
        }
      }
    };

    void checkChzzkLive();

    return () => {
      controller.abort();
    };
  }, [artist.chzzkChannelId]);

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
        <div className="artist-library__name-row">
          <span className="artist-library__name">{artist.displayName || artist.name}</span>
          {isChzzkLive && <span className="artist-library__live-badge">ON AIR</span>}
        </div>
        <span className="artist-library__channel">
          {artist.youtubeChannelTitle || artist.youtubeChannelId}
        </span>
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
