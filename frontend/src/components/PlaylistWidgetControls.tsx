import React from 'react';
import type { PlaylistBarItem } from './PlaylistBar';

interface PlaylistWidgetControlsProps {
  queue: PlaylistBarItem[];
  currentClip: PlaylistBarItem | null;
  onPlayClip: (clip: PlaylistBarItem) => void;
  onRemoveFromQueue: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PlaylistWidgetControls: React.FC<PlaylistWidgetControlsProps> = ({
  queue,
  currentClip,
  onPlayClip,
  onRemoveFromQueue,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="playlist-drawer">
      <div className="drawer-header">
        <h3>다음 트랙</h3>
        <div className="drawer-tabs">
          <button className="active" type="button">
            다음 트랙
          </button>
          <button type="button" disabled>
            가사
          </button>
          <button type="button" disabled>
            관련 항목
          </button>
        </div>
        <button className="close-drawer-btn" type="button" onClick={onClose} aria-label="재생목록 닫기">
          ✕
        </button>
      </div>

      <div className="drawer-content">
        {queue.length === 0 ? (
          <div className="empty-msg">재생목록이 비어있습니다.</div>
        ) : (
          queue.map((clip, index) => {
            const isActive = currentClip?.key === clip.key;
            return (
              <div
                key={clip.key}
                className={`compact-item${isActive ? ' active' : ''}`}
                onClick={() => onPlayClip(clip)}
                role="button"
                tabIndex={0}
              >
                <div className="ci-left">
                  {clip.thumbnailUrl ? (
                    <img src={clip.thumbnailUrl} className="ci-thumb" alt="" />
                  ) : (
                    <div className="ci-thumb ci-thumb--placeholder">No image</div>
                  )}
                  {isActive && <div className="playing-overlay">📊</div>}
                </div>
                <div className="ci-info">
                  <div className="ci-title">{clip.title}</div>
                  <div className="ci-artist">{clip.subtitle ?? '동영상'}</div>
                </div>
                <div className="ci-right">
                  <span className="ci-duration">{clip.durationLabel ?? '—'}</span>
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
