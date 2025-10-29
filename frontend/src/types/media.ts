export interface VideoSectionResponse {
  title: string;
  startSec: number;
  endSec: number;
  source: string;
}

export interface VideoArtistResponse {
  id: number;
  name: string;
  displayName: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  profileImageUrl?: string | null;
  isPrimary: boolean;
}

export interface VideoResponse {
  id: number;
  artistId: number;
  primaryArtistId?: number | null;
  youtubeVideoId: string;
  title: string;
  durationSec?: number | string | null;
  thumbnailUrl?: string | null;
  channelId?: string | null;
  contentType?: 'OFFICIAL' | 'CLIP_SOURCE' | string;
  category?: 'live' | 'cover' | 'original' | string | null;
  sections?: VideoSectionResponse[];
  hidden?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  originalComposer?: string | null;
  artistName?: string | null;
  artistDisplayName?: string | null;
  artistYoutubeChannelId?: string | null;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
  artists?: VideoArtistResponse[];
}

export interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
  originalComposer?: string | null;
  youtubeVideoId?: string | null;
  videoTitle?: string | null;
  videoOriginalComposer?: string | null;
  artistId?: number | null;
  primaryArtistId?: number | null;
  artistName?: string | null;
  artistDisplayName?: string | null;
  artistYoutubeChannelId?: string | null;
  artistYoutubeChannelTitle?: string | null;
  artistProfileImageUrl?: string | null;
  artists?: VideoArtistResponse[];
  createdAt?: string | null;
  updatedAt?: string | null;
}
