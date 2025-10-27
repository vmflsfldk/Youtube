export interface VideoSectionResponse {
  title: string;
  startSec: number;
  endSec: number;
  source: string;
}

export interface VideoResponse {
  id: number;
  artistId: number;
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
}
