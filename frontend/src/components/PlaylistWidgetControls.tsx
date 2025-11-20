import React from 'react';
import '../styles.css';
import type { PlaylistBarItem } from './PlaylistBar';

interface PlaylistWidgetControlsProps {
  queue: PlaylistBarItem[];
  currentClip: PlaylistBarItem | null;
  onPlayClip: (clip: PlaylistBarItem) => void;
  onRemoveFromQueue: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  isMobileView?: boolean;
}

const PlaylistWidgetControls: React.FC<PlaylistWidgetControlsProps> = ({
  queue,
  currentClip,
  onPlayClip,
  onRemoveFromQueue,
  isOpen,
  onClose,
  isMobileView = false
}) => {
  if (!isOpen) return null;

  return (
    <div className={`playlist-drawer${isMobileView ? ' mobile-view-mode' : ''}`}>
      {!isMobileView && (
        <div className="drawer-header">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>다음 트랙</h3>
            <span style={{ fontSize: '12px', color: '#666' }}>({queue.length}곡)</span>
          </div>
          <button
            className="close-drawer-btn"
            type="button"
            onClick={onClose}
            aria-label="재생목록 닫기"
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 리스트 영역 */}
      <div className="drawer-content">
        {queue.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            재생 대기 목록이 없습니다.
          </div>
        ) : (
          queue.map((clip, index) => {
            const isActive = currentClip?.key === clip.key;
            const videoId = clip.youtubeVideoId ?? '';

            return (
              <div
                key={`${clip.key}-${index}`}
                className={`compact-item ${isActive ? 'active' : ''}`}
                onClick={() => onPlayClip(clip)}
              >
                <div className="ci-left">
                  <img
                    src={
                      clip.thumbnailUrl ||
                      (videoId ? `https://img.youtube.com/vi/${videoId}/default.jpg` : undefined)
                    }
                    className="ci-thumb"
                    alt=""
                  />
                  {isActive && (
                    <div className="playing-overlay">
                      <span>📊</span>
                    </div>
                  )}
                </div>

                <div className="ci-info">
                  <div className="ci-title">{clip.title}</div>
                  <div className="ci-artist">{clip.subtitle ?? '동영상'}</div>
                </div>

                <div className="ci-right">
                  {clip.durationLabel && <span className="ci-duration">{clip.durationLabel}</span>}
                  <button
                    className="ci-remove"
                    type="button"
                    aria-label={`${clip.title} 제거`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveFromQueue(index);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PlaylistWidgetControls;
