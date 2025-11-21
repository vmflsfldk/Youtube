import type { ReactNode } from 'react';
import { extractYouTubeVideoId, getThumbnailUrl } from '../utils/videos';

interface VideoPreviewCardProps {
  url: string;
  statusLabel?: string;
  statusTone?: 'info' | 'success' | 'warning' | 'danger';
  actionLabel?: string;
  onConfirm?: () => void;
  footer?: ReactNode;
}

const toneClassMap: Record<NonNullable<VideoPreviewCardProps['statusTone']>, string> = {
  info: 'video-preview-card__badge--info',
  success: 'video-preview-card__badge--success',
  warning: 'video-preview-card__badge--warning',
  danger: 'video-preview-card__badge--danger'
};

export const VideoPreviewCard = ({
  url,
  statusLabel,
  statusTone = 'info',
  actionLabel,
  onConfirm,
  footer
}: VideoPreviewCardProps) => {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    return null;
  }

  return (
    <div className="video-preview-card" aria-live="polite">
      <div className="video-preview-card__header">
        <div className="video-preview-card__eyebrow">영상 미리보기</div>
        {statusLabel && (
          <span className={`video-preview-card__badge ${toneClassMap[statusTone]}`}>{statusLabel}</span>
        )}
      </div>

      <div className="video-preview-card__body">
        <div className="video-preview-card__thumbnail" aria-hidden="true">
          <img src={getThumbnailUrl(videoId)} alt="Video thumbnail" loading="lazy" decoding="async" />
          <span className="video-preview-card__play-icon" aria-hidden>
            <span className="video-preview-card__play-triangle" />
          </span>
        </div>

        <div className="video-preview-card__meta">
          <p className="video-preview-card__id" aria-label="YouTube Video ID">
            ID <span>{videoId}</span>
          </p>
          <p className="video-preview-card__hint">URL에서 유효한 YouTube 영상을 확인했어요.</p>
          {onConfirm && actionLabel && (
            <button type="button" className="video-preview-card__action" onClick={onConfirm}>
              {actionLabel}
            </button>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
};

export default VideoPreviewCard;
