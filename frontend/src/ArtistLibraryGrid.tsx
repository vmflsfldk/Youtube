import { memo, useState, useMemo, useEffect } from 'react';
import ArtistLibraryCard, { type ArtistLibraryCardData } from './components/ArtistLibraryCard';
import type { ArtistResponse } from './types/artists';

interface ArtistLibraryGridProps {
  artists: ArtistResponse[];
  filter: 'all' | 'live' | 'bookmark';
  searchQuery: string;
  onSelectArtist: (artist: ArtistResponse) => void;
}

const ArtistLibraryGrid = ({
  artists,
  filter,
  searchQuery,
  onSelectArtist
}: ArtistLibraryGridProps) => {
  const [chzzkLiveMap, setChzzkLiveMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const checkAllLives = async () => {
      const newLiveStatus: Record<string, boolean> = {};
      let hasUpdates = false;

      const targetArtists = artists.filter((a) => a.chzzkChannelId);

      await Promise.all(
        targetArtists.map(async (artist) => {
          try {
            const res = await fetch(`/api/chzzk/status?channelId=${artist.chzzkChannelId}`);
            const data = await res.json();

            if (data.isLive) {
              newLiveStatus[String(artist.id)] = true;
              hasUpdates = true;
              console.log(`✅ [${artist.name}] 치지직 라이브 확인됨!`);
            }
          } catch (err) {
            console.error(`❌ [${artist.name}] 치지직 조회 실패`, err);
          }
        })
      );

      if (hasUpdates) {
        console.log('🔄 상태 업데이트 적용:', newLiveStatus);
        setChzzkLiveMap((prev) => ({ ...prev, ...newLiveStatus }));
      }
    };

    if (artists.length > 0) {
      checkAllLives();
    }
  }, [artists]);

  const filteredArtists = useMemo(() => {
    return artists.filter((artist) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = artist.name.toLowerCase();
        const displayName = artist.displayName?.toLowerCase() || '';
        if (!name.includes(query) && !displayName.includes(query)) {
          return false;
        }
      }

      const isChzzkLive = !!chzzkLiveMap[String(artist.id)];
      const isYoutubeLive = artist.liveVideos && artist.liveVideos.length > 0;
      const isLive = isYoutubeLive || isChzzkLive;

      if (filter === 'live' && !isLive) {
        return false;
      }

      return true;
    });
  }, [artists, filter, searchQuery, chzzkLiveMap]);

  if (filteredArtists.length === 0) {
    return <div className="text-center p-8 text-gray-500">표시할 아티스트가 없습니다.</div>;
  }

  return (
    <div className="artist-library__grid">
      {filteredArtists.map((artist) => {
        const cardData: ArtistLibraryCardData = {
          fallbackAvatarUrl: '/default-profile.png',
          countryBadges: [],
          agency: artist.agency || '',
          tags: artist.tags || [],
          displayName: artist.displayName || artist.name
        };

        return (
          <ArtistLibraryCard
            key={artist.id}
            artist={artist}
            cardData={cardData}
            onSelect={() => onSelectArtist(artist)}
          />
        );
      })}
    </div>
  );
};

export default memo(ArtistLibraryGrid);
