import { useState } from 'react';
import utahubLogo from './assets/utahub-logo.svg';

export type ArtistSearchMode = 'all' | 'name' | 'tag';

const vtubers = [
  { id: '1', handle: '@VirtualStar_Ch', followers: '12,932', statLabel: 'Follower', accent: '#4f46e5' },
  { id: '2', handle: '@VirtualStar_Ch', followers: '14,502', statLabel: 'Follower', accent: '#2563eb' },
  { id: '3', handle: '@VirtualStar_Ch', followers: '2,584', statLabel: 'Followers', accent: '#14b8a6' },
  { id: '4', handle: '@VirtualStar_Ch', followers: '3,481', statLabel: 'Followers', accent: '#f59e0b' }
];

const playback = {
  title: 'Epic Boss Battle',
  artist: '@VirtualStar_Ch',
  duration: '3:20',
  position: '0:30'
};

const formatSegmentLabel = (value: 'artists' | 'songs') => (value === 'artists' ? '아티스트' : '노래');

function MobileSegmentedControl(props: {
  value: 'artists' | 'songs';
  onChange: (value: 'artists' | 'songs') => void;
}) {
  const options: Array<'artists' | 'songs'> = ['artists', 'songs'];

  return (
    <div className="segmented-control" role="tablist" aria-label="콘텐츠 카테고리">
      {options.map((option) => {
        const isActive = option === props.value;
        return (
          <button
            key={option}
            role="tab"
            type="button"
            className={isActive ? 'segmented-control__button segmented-control__button--active' : 'segmented-control__button'}
            aria-selected={isActive}
            onClick={() => props.onChange(option)}
          >
            {formatSegmentLabel(option)}
          </button>
        );
      })}
    </div>
  );
}

function VtuberCard({ handle, followers, statLabel, accent }: (typeof vtubers)[number]) {
  return (
    <article className="artist-card">
      <div className="artist-card__avatar" aria-hidden="true">
        <span className="artist-card__avatar-glow" style={{ background: accent }} />
        <img src="https://avatars.githubusercontent.com/u/9919" alt="" />
      </div>
      <div className="artist-card__body">
        <h3 className="artist-card__handle">{handle}</h3>
        <p className="artist-card__stat">
          <span className="artist-card__stat-value">{followers}</span>
          <span className="artist-card__stat-label">{statLabel}</span>
        </p>
      </div>
      <button type="button" className="artist-card__action" aria-label="아티스트 추가">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c.414 0 .75.336.75.75V11h5.25a.75.75 0 0 1 0 1.5H12.75v5.25a.75.75 0 0 1-1.5 0V12.5H6a.75.75 0 0 1 0-1.5h5.25V5.75c0-.414.336-.75.75-.75z" />
        </svg>
      </button>
    </article>
  );
}

function MobilePlayer() {
  return (
    <footer className="mobile-player" aria-label="현재 재생중">
      <div className="mobile-player__artwork">
        <img src="https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=120&q=80" alt="" />
      </div>
      <div className="mobile-player__meta">
        <p className="mobile-player__title">{playback.title}</p>
        <p className="mobile-player__subtitle">{playback.artist}</p>
      </div>
      <div className="mobile-player__timeline" aria-hidden="true">
        <span className="mobile-player__position">{playback.position}</span>
        <div className="mobile-player__progress">
          <span style={{ width: '40%' }} />
        </div>
        <span className="mobile-player__duration">{playback.duration}</span>
      </div>
      <div className="mobile-player__controls">
        <button type="button" aria-label="이전 곡" className="mobile-player__icon-button">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.75 6.75a.75.75 0 1 0-1.5 0v10.5a.75.75 0 0 0 1.5 0zm1.36 5.1 7.1 4.42c.66.41 1.49-.07 1.49-.84V8.57c0-.77-.83-1.25-1.49-.84l-7.1 4.42a1 1 0 0 0 0 1.7z" />
          </svg>
        </button>
        <button type="button" aria-label="재생" className="mobile-player__play">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 7.47v9.06c0 .7.75 1.15 1.36.78l7.05-4.53c.58-.37.58-1.2 0-1.57L10.86 6.68C10.25 6.3 9.5 6.76 9.5 7.47z" />
          </svg>
        </button>
        <button type="button" aria-label="다음 곡" className="mobile-player__icon-button">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.25 17.25a.75.75 0 0 0 1.5 0V6.75a.75.75 0 0 0-1.5 0zm-1.36-5.1-7.1-4.42c-.66-.41-1.49.07-1.49.84v7.86c0 .77.83 1.25 1.49.84l7.1-4.42a1 1 0 0 0 0-1.7z" />
          </svg>
        </button>
      </div>
    </footer>
  );
}

export default function App() {
  const [segment, setSegment] = useState<'artists' | 'songs'>('artists');

  return (
    <div className="mobile-shell">
      <div className="mobile-shell__glow" aria-hidden="true" />
      <div className="status-bar" aria-hidden="true">
        <span className="status-bar__time">9:41</span>
        <div className="status-bar__indicators">
          <span className="status-bar__signal" />
          <span className="status-bar__wifi" />
          <span className="status-bar__battery">100%</span>
        </div>
      </div>
      <header className="mobile-header">
        <div className="mobile-header__logo" aria-hidden="true">
          <img src={utahubLogo} alt="Utahub" />
        </div>
        <div className="mobile-header__actions">
          <button type="button" className="mobile-header__action" aria-label="알림">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a5 5 0 0 0-5 5v3.62l-.82 3.3a1 1 0 0 0 .97 1.24h10.7a1 1 0 0 0 .97-1.24l-.82-3.3V8a5 5 0 0 0-5-5zm0 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21z" />
            </svg>
          </button>
        </div>
      </header>
      <MobileSegmentedControl value={segment} onChange={setSegment} />
      <section className="collection">
        <div className="collection__header">
          <h2>VTUBERS</h2>
          <span className="collection__meta">전체 348</span>
        </div>
        <div className="collection__list">
          {vtubers.map((artist) => (
            <VtuberCard key={artist.id} {...artist} />
          ))}
        </div>
      </section>
      <MobilePlayer />
    </div>
  );
}
