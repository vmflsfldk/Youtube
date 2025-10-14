import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import ClipPlayer from './components/ClipPlayer';

interface ArtistResponse {
  id: number;
  name: string;
  youtubeChannelId: string;
}

interface VideoResponse {
  id: number;
  artistId: number;
  youtubeVideoId: string;
  title: string;
  durationSec?: number;
  thumbnailUrl?: string;
  channelId?: string;
}

interface ClipResponse {
  id: number;
  videoId: number;
  title: string;
  startSec: number;
  endSec: number;
  tags: string[];
}

interface ClipCandidateResponse {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
}

const http = axios.create({
  baseURL: '/api'
});

export default function App() {
  const [email, setEmail] = useState('demo@example.com');
  const [displayName, setDisplayName] = useState('Demo User');
  const [artists, setArtists] = useState<ArtistResponse[]>([]);
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [clipCandidates, setClipCandidates] = useState<ClipCandidateResponse[]>([]);
  const [artistForm, setArtistForm] = useState({ name: '', channelId: '' });
  const [videoForm, setVideoForm] = useState({ url: '', artistId: '', description: '', captionsJson: '' });
  const [clipForm, setClipForm] = useState({ title: '', startSec: 0, endSec: 0, tags: '' });
  const [autoDetectMode, setAutoDetectMode] = useState('chapters');

  const authHeaders = useMemo(
    () => ({
      'X-User-Email': email,
      'X-User-Name': displayName
    }),
    [email, displayName]
  );

  const fetchArtists = useCallback(async () => {
    const response = await http.get<ArtistResponse[]>('/artists', { headers: authHeaders });
    setArtists(response.data);
  }, [authHeaders]);

  const handleArtistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await http.post<ArtistResponse>(
      '/artists',
      { name: artistForm.name, youtubeChannelId: artistForm.channelId },
      { headers: authHeaders }
    );
    setArtistForm({ name: '', channelId: '' });
    await fetchArtists();
  };

  const handleVideoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await http.post<VideoResponse>(
      '/videos',
      {
        videoUrl: videoForm.url,
        artistId: Number(videoForm.artistId),
        description: videoForm.description,
        captionsJson: videoForm.captionsJson
      },
      { headers: authHeaders }
    );
    setVideos((prev) => [...prev.filter((v) => v.id !== response.data.id), response.data]);
    setSelectedVideo(response.data.id);
    setVideoForm({ url: '', artistId: '', description: '', captionsJson: '' });
  };

  useEffect(() => {
    if (!selectedVideo) {
      return;
    }
    (async () => {
      const response = await http.get<ClipResponse[]>('/clips', {
        headers: authHeaders,
        params: { videoId: selectedVideo }
      });
      setClips(response.data);
    })();
  }, [selectedVideo, authHeaders]);

  const handleClipSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVideo) {
      return;
    }
    const response = await http.post<ClipResponse>(
      '/clips',
      {
        videoId: selectedVideo,
        title: clipForm.title,
        startSec: Number(clipForm.startSec),
        endSec: Number(clipForm.endSec),
        tags: clipForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      },
      { headers: authHeaders }
    );
    setClips((prev) => [...prev, response.data]);
    setClipForm({ title: '', startSec: 0, endSec: 0, tags: '' });
  };

  const runAutoDetect = async () => {
    if (!selectedVideo) {
      return;
    }
    const response = await http.post<ClipCandidateResponse[]>(
      '/clips/auto-detect',
      { videoId: selectedVideo, mode: autoDetectMode },
      { headers: authHeaders }
    );
    setClipCandidates(response.data);
  };

  useEffect(() => {
    if (!videoForm.artistId) {
      return;
    }
    (async () => {
      const response = await http.get<VideoResponse[]>('/videos', {
        headers: authHeaders,
        params: { artistId: Number(videoForm.artistId) }
      });
      setVideos(response.data);
    })();
  }, [videoForm.artistId, authHeaders]);

  return (
    <main>
      <section>
        <h1>Creator Dashboard</h1>
        <p>Authenticate requests by providing your email and display name.</p>
        <div className="form-row">
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        </div>
        <button type="button" onClick={fetchArtists}>
          Refresh my artists
        </button>
      </section>

      <section>
        <h2>Create artist</h2>
        <form onSubmit={handleArtistSubmit} className="form-grid">
          <div>
            <label htmlFor="artistName">Artist name</label>
            <input
              id="artistName"
              value={artistForm.name}
              onChange={(event) => setArtistForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div>
            <label htmlFor="artistChannel">YouTube channel ID</label>
            <input
              id="artistChannel"
              value={artistForm.channelId}
              onChange={(event) => setArtistForm((prev) => ({ ...prev, channelId: event.target.value }))}
              required
            />
          </div>
          <button type="submit">Save artist</button>
        </form>
      </section>

      <section>
        <h2>Register video</h2>
        <form onSubmit={handleVideoSubmit} className="form-grid">
          <div>
            <label htmlFor="videoUrl">YouTube URL</label>
            <input
              id="videoUrl"
              value={videoForm.url}
              onChange={(event) => setVideoForm((prev) => ({ ...prev, url: event.target.value }))}
              required
            />
          </div>
          <div>
            <label htmlFor="artistSelect">Artist</label>
            <select
              id="artistSelect"
              value={videoForm.artistId}
              onChange={(event) => setVideoForm((prev) => ({ ...prev, artistId: event.target.value }))}
              required
            >
              <option value="" disabled>
                Select artist
              </option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="description">Video description (optional)</label>
            <textarea
              id="description"
              rows={3}
              value={videoForm.description}
              onChange={(event) => setVideoForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="captions">Captions JSON or start|text pairs</label>
            <textarea
              id="captions"
              rows={3}
              value={videoForm.captionsJson}
              onChange={(event) => setVideoForm((prev) => ({ ...prev, captionsJson: event.target.value }))}
            />
          </div>
          <button type="submit">Fetch metadata &amp; save</button>
        </form>
      </section>

      <section>
        <h2>Create clip</h2>
        <form onSubmit={handleClipSubmit} className="form-grid">
          <div>
            <label htmlFor="videoSelect">Video</label>
            <select
              id="videoSelect"
              value={selectedVideo ?? ''}
              onChange={(event) => setSelectedVideo(Number(event.target.value))}
              required
            >
              <option value="" disabled>
                Select video
              </option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title || video.youtubeVideoId}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div>
              <label htmlFor="clipTitle">Clip title</label>
              <input
                id="clipTitle"
                value={clipForm.title}
                onChange={(event) => setClipForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="startSec">Start (seconds)</label>
              <input
                id="startSec"
                type="number"
                min={0}
                value={clipForm.startSec}
                onChange={(event) => setClipForm((prev) => ({ ...prev, startSec: Number(event.target.value) }))}
                required
              />
            </div>
            <div>
              <label htmlFor="endSec">End (seconds)</label>
              <input
                id="endSec"
                type="number"
                min={0}
                value={clipForm.endSec}
                onChange={(event) => setClipForm((prev) => ({ ...prev, endSec: Number(event.target.value) }))}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="clipTags">Tags (comma separated)</label>
            <input
              id="clipTags"
              value={clipForm.tags}
              onChange={(event) => setClipForm((prev) => ({ ...prev, tags: event.target.value }))}
            />
          </div>
          <button type="submit">Save clip</button>
        </form>
      </section>

      {clipCandidates.length > 0 && (
        <section>
          <h2>Detected clip suggestions</h2>
          <div className="clip-grid">
            {clipCandidates.map((candidate, index) => (
              <div className="clip-card" key={`${candidate.startSec}-${candidate.endSec}-${index}`}>
                <h3>{candidate.label || `Segment ${index + 1}`}</h3>
                <p>
                  {candidate.startSec}s → {candidate.endSec}s (score {(candidate.score * 100).toFixed(0)}%)
                </p>
                {selectedVideo && (
                  <ClipPlayer
                    youtubeVideoId={videos.find((video) => video.id === selectedVideo)?.youtubeVideoId || ''}
                    startSec={candidate.startSec}
                    endSec={candidate.endSec}
                    autoplay={false}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Run automatic detection</h2>
        <div className="form-row">
          <div>
            <label htmlFor="detectVideo">Video</label>
            <select
              id="detectVideo"
              value={selectedVideo ?? ''}
              onChange={(event) => setSelectedVideo(Number(event.target.value))}
            >
              <option value="" disabled>
                Select video
              </option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title || video.youtubeVideoId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mode">Mode</label>
            <select id="mode" value={autoDetectMode} onChange={(event) => setAutoDetectMode(event.target.value)}>
              <option value="chapters">Chapters</option>
              <option value="captions">Captions</option>
              <option value="combined">Combined</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={runAutoDetect}>
          Suggest clips
        </button>
      </section>

      <section>
        <h2>Saved clips</h2>
        {clips.length === 0 && <p>No clips yet. Create one above!</p>}
        <div className="clip-grid">
          {clips.map((clip) => (
            <div className="clip-card" key={clip.id}>
              <h3>{clip.title}</h3>
              <p>
                {clip.startSec}s → {clip.endSec}s
              </p>
              <div>
                {clip.tags.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>
              {videos.find((video) => video.id === clip.videoId) && (
                <ClipPlayer
                  youtubeVideoId={videos.find((video) => video.id === clip.videoId)!.youtubeVideoId}
                  startSec={clip.startSec}
                  endSec={clip.endSec}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
