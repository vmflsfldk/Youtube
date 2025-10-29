export type ArtistMatchable = {
  artistId?: number | string | null;
  primaryArtistId?: number | string | null;
  artists?: { id: number | string }[] | null;
};

const normalizeArtistId = (value: number | string | null | undefined): number | null => {
  if (value === null || typeof value === 'undefined') {
    return null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric;
};

export const mediaMatchesArtist = (
  media: ArtistMatchable,
  artistId: number | string | null
): boolean => {
  if (artistId === null) {
    return true;
  }

  const normalizedArtistId = normalizeArtistId(artistId);
  if (normalizedArtistId === null) {
    return false;
  }

  const mediaArtistId = normalizeArtistId(media.artistId);
  if (mediaArtistId !== null && mediaArtistId === normalizedArtistId) {
    return true;
  }

  const mediaPrimaryArtistId = normalizeArtistId(media.primaryArtistId);
  if (mediaPrimaryArtistId !== null && mediaPrimaryArtistId === normalizedArtistId) {
    return true;
  }

  if (Array.isArray(media.artists)) {
    return media.artists.some((artist) => {
      const normalizedArtist = normalizeArtistId(artist?.id);
      return normalizedArtist !== null && normalizedArtist === normalizedArtistId;
    });
  }
  return false;
};
