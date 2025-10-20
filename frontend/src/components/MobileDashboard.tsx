import { ChangeEvent, FormEvent } from 'react';
import utahubLogo from '../assets/utahub-logo.svg';
import { ArtistResponse, ClipResponse, VideoResponse } from '../App';
import GoogleLoginButton from './GoogleLoginButton';

const formatSeconds = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const minutePart = minutes.toString().padStart(2, '0');
  const secondPart = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${minutePart}:${secondPart}`;
  }

  return `${minutes}:${secondPart}`;
};

const resolveVideoTitle = (video: VideoResponse): string => {
  if (video.title && video.title.trim().length > 0) {
    return video.title.trim();
  }
  if (video.youtubeVideoId && video.youtubeVideoId.trim().length > 0) {
    return video.youtubeVideoId.trim();
  }
  return '제목 없는 영상';
};

const resolveArtistName = (artist: ArtistResponse | null): string => {
  if (!artist) {
    return '선택된 아티스트가 없습니다';
  }
  if (artist.displayName && artist.displayName.trim().length > 0) {
    return artist.displayName.trim();
  }
  if (artist.name && artist.name.trim().length > 0) {
    return artist.name.trim();
  }
  return '이름 정보 없음';
};

type MobileDashboardProps = {
  greetingMessage: string;
  isAuthenticated: boolean;
  isLoadingUser: boolean;
  isGoogleReady: boolean;
  nicknameInput: string;
  nicknameStatus: string | null;
  nicknameError: string | null;
  onNicknameChange: (value: string) => void;
  onNicknameSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
  onGoogleCredential: (credential: string) => void;
  onOpenDetails: (callback?: () => void) => void;
  onOpenArtistRegistration: () => void;
  onRegisterVideo: () => void;
  onRegisterClip: () => void;
  selectedArtist: ArtistResponse | null;
  selectedVideo: VideoResponse | null;
  activeClip: ClipResponse | null;
  recentVideos: VideoResponse[];
  recentClips: ClipResponse[];
  totalVideos: number;
  totalClips: number;
  creationDisabled: boolean;
};

const MobileDashboard = ({
  greetingMessage,
  isAuthenticated,
  isLoadingUser,
  isGoogleReady,
  nicknameInput,
  nicknameStatus,
  nicknameError,
  onNicknameChange,
  onNicknameSubmit,
  onSignOut,
  onGoogleCredential,
  onOpenDetails,
  onOpenArtistRegistration,
  onRegisterVideo,
  onRegisterClip,
  selectedArtist,
  selectedVideo,
  activeClip,
  recentVideos,
  recentClips,
  totalVideos,
  totalClips,
  creationDisabled
}: MobileDashboardProps) => {
  const handleNicknameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onNicknameChange(event.target.value);
  };

  const handleArtistRegistration = () => {
    onOpenDetails(onOpenArtistRegistration);
  };

  const handleVideoRegistration = () => {
    onOpenDetails(onRegisterVideo);
  };

  const handleClipRegistration = () => {
    onOpenDetails(onRegisterClip);
  };

  const renderRecentVideos = () => {
    if (recentVideos.length === 0) {
      return <p className="mobile-dashboard__empty">최근 등록된 영상이 없습니다.</p>;
    }

    return (
      <ul className="mobile-dashboard__list">
        {recentVideos.map((video) => (
          <li key={video.id} className="mobile-dashboard__list-item">
            <div>
              <p className="mobile-dashboard__list-title">{resolveVideoTitle(video)}</p>
              <p className="mobile-dashboard__list-subtitle">
                {formatSeconds(video.durationSec ?? 0)}
              </p>
            </div>
            <button
              type="button"
              className="mobile-dashboard__list-action"
              onClick={handleVideoRegistration}
              disabled={creationDisabled || !selectedArtist}
            >
              폼 열기
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderRecentClips = () => {
    if (recentClips.length === 0) {
      return <p className="mobile-dashboard__empty">최근 저장된 클립이 없습니다.</p>;
    }

    return (
      <ul className="mobile-dashboard__list">
        {recentClips.map((clip) => (
          <li key={clip.id} className="mobile-dashboard__list-item">
            <div>
              <p className="mobile-dashboard__list-title">{clip.title}</p>
              <p className="mobile-dashboard__list-subtitle">
                {formatSeconds(clip.startSec)} → {formatSeconds(clip.endSec)}
              </p>
            </div>
            <button
              type="button"
              className="mobile-dashboard__list-action"
              onClick={handleClipRegistration}
              disabled={creationDisabled || !selectedArtist}
            >
              편집
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const artistName = resolveArtistName(selectedArtist);
  const selectedVideoTitle = selectedVideo ? resolveVideoTitle(selectedVideo) : '선택된 영상이 없습니다';
  const selectedVideoDuration = selectedVideo ? formatSeconds(selectedVideo.durationSec ?? 0) : '0:00';

  return (
    <div className="mobile-dashboard">
      <header className="mobile-dashboard__header">
        <div className="mobile-dashboard__brand">
          <img src={utahubLogo} alt="UtaHub 로고" />
          <div>
            <p className="mobile-dashboard__eyebrow">UtaHub</p>
            <h1 className="mobile-dashboard__title">UtaHub Studio</h1>
            <p className="mobile-dashboard__subtitle">한눈에 보는 모바일 대시보드</p>
          </div>
        </div>
        <button type="button" className="mobile-dashboard__manage-button" onClick={() => onOpenDetails()}>
          전체 관리 열기
        </button>
      </header>

      <section className="mobile-dashboard__card mobile-dashboard__welcome">
        <h2>환영합니다</h2>
        <p className="mobile-dashboard__greeting">{greetingMessage}</p>
        {isAuthenticated ? (
          <>
            {isLoadingUser && <p className="mobile-dashboard__muted">사용자 정보를 불러오는 중...</p>}
            <form className="mobile-dashboard__form" onSubmit={onNicknameSubmit}>
              <label htmlFor="mobileNicknameInput">닉네임</label>
              <input
                id="mobileNicknameInput"
                value={nicknameInput}
                onChange={handleNicknameChange}
                placeholder="닉네임을 입력하세요"
              />
              <div className="mobile-dashboard__form-actions">
                <button type="submit">닉네임 저장</button>
                <button type="button" onClick={onSignOut} className="mobile-dashboard__secondary-button">
                  로그아웃
                </button>
              </div>
            </form>
            {nicknameStatus && <p className="mobile-dashboard__status">{nicknameStatus}</p>}
            {nicknameError && (
              <p className="mobile-dashboard__status mobile-dashboard__status--error">{nicknameError}</p>
            )}
            <p className="mobile-dashboard__hint">상세 관리 화면에서 추가 프로필 정보를 설정할 수 있습니다.</p>
          </>
        ) : (
          <div className="mobile-dashboard__auth">
            <p className="mobile-dashboard__muted">Google 계정으로 로그인해 클립을 저장하세요.</p>
            <div className="mobile-dashboard__auth-action">
              {isGoogleReady ? (
                <GoogleLoginButton
                  clientId="245943329145-os94mkp21415hadulir67v1i0lqjrcnq.apps.googleusercontent.com"
                  onCredential={onGoogleCredential}
                />
              ) : (
                <span className="mobile-dashboard__muted">구글 로그인 준비 중...</span>
              )}
            </div>
            <button type="button" className="mobile-dashboard__secondary-button" onClick={() => onOpenDetails()}>
              로그인 도움말 보기
            </button>
          </div>
        )}
      </section>

      <section className="mobile-dashboard__card mobile-quick-actions">
        <h2>빠른 작업</h2>
        <div className="mobile-quick-actions__grid">
          <button type="button" onClick={handleArtistRegistration} className="mobile-quick-actions__button">
            아티스트 등록
          </button>
          <button
            type="button"
            onClick={handleVideoRegistration}
            className="mobile-quick-actions__button"
            disabled={creationDisabled || !selectedArtist}
          >
            영상 등록
          </button>
          <button
            type="button"
            onClick={handleClipRegistration}
            className="mobile-quick-actions__button"
            disabled={creationDisabled || !selectedArtist}
          >
            클립 등록
          </button>
        </div>
        {creationDisabled && (
          <p className="mobile-dashboard__hint">로그인하면 영상과 클립을 저장할 수 있습니다.</p>
        )}
        {!selectedArtist && !creationDisabled && (
          <p className="mobile-dashboard__hint">먼저 아티스트를 선택하면 영상·클립 등록이 쉬워집니다.</p>
        )}
      </section>

      <section className="mobile-dashboard__card mobile-artist-summary">
        <h2>아티스트 요약</h2>
        <p className="mobile-dashboard__summary-title">{artistName}</p>
        {selectedArtist && (
          <p className="mobile-dashboard__summary-subtitle">
            {selectedArtist.youtubeChannelTitle ?? selectedArtist.youtubeChannelId}
          </p>
        )}
        <div className="mobile-dashboard__summary-grid">
          <div className="mobile-dashboard__summary-stat">
            <span className="mobile-dashboard__summary-value">{totalVideos}</span>
            <span className="mobile-dashboard__summary-label">등록 영상</span>
          </div>
          <div className="mobile-dashboard__summary-stat">
            <span className="mobile-dashboard__summary-value">{totalClips}</span>
            <span className="mobile-dashboard__summary-label">저장 클립</span>
          </div>
        </div>
        <button type="button" className="mobile-dashboard__secondary-button" onClick={() => onOpenDetails()}>
          아티스트 관리 열기
        </button>
      </section>

      <section className="mobile-dashboard__card mobile-dashboard__focus">
        <h2>현재 선택</h2>
        <div className="mobile-dashboard__focus-card">
          <h3>영상</h3>
          <p className="mobile-dashboard__list-title">{selectedVideoTitle}</p>
          <p className="mobile-dashboard__list-subtitle">재생 시간 {selectedVideoDuration}</p>
        </div>
        <div className="mobile-dashboard__focus-card">
          <h3>클립</h3>
          {activeClip ? (
            <>
              <p className="mobile-dashboard__list-title">{activeClip.title}</p>
              <p className="mobile-dashboard__list-subtitle">
                {formatSeconds(activeClip.startSec)} → {formatSeconds(activeClip.endSec)}
              </p>
            </>
          ) : (
            <p className="mobile-dashboard__muted">선택된 클립이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="mobile-dashboard__card mobile-dashboard__recent">
        <div className="mobile-dashboard__section-header">
          <h2>최근 영상</h2>
          <button type="button" className="mobile-dashboard__link" onClick={handleVideoRegistration}>
            영상 폼 열기
          </button>
        </div>
        {renderRecentVideos()}
      </section>

      <section className="mobile-dashboard__card mobile-dashboard__recent">
        <div className="mobile-dashboard__section-header">
          <h2>최근 클립</h2>
          <button type="button" className="mobile-dashboard__link" onClick={handleClipRegistration}>
            클립 폼 열기
          </button>
        </div>
        {renderRecentClips()}
      </section>

      <section className="mobile-dashboard__card mobile-dashboard__actions">
        <h2>세부 관리</h2>
        <p className="mobile-dashboard__muted">전체 패널을 열어 폼과 필터를 사용할 수 있습니다.</p>
        <button type="button" className="mobile-dashboard__cta-button" onClick={() => onOpenDetails()}>
          전체 관리 화면 열기
        </button>
      </section>
    </div>
  );
};

export default MobileDashboard;
