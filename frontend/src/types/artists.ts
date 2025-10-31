export interface ArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  profileImageUrl?: string | null;
  availableKo: boolean;
  availableEn: boolean;
  availableJp: boolean;
  agency?: string | null;
  tags: string[];
}

export interface LiveBroadcastResponse {
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  url: string | null;
  startedAt: string | null;
  scheduledStartAt: string | null;
}

export interface LiveArtistResponse {
  artist: ArtistResponse;
  liveVideos: LiveBroadcastResponse[];
}
