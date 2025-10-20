import type { ReactNode } from 'react';

interface ClipPreviewPanelProps {
  clipTitle: string;
  videoTitle?: string | null;
  rangeLabel: string;
  tags?: string[];
  isEditing?: boolean;
  children: ReactNode;
}

export default function ClipPreviewPanel({
  clipTitle,
  videoTitle,
  rangeLabel,
  tags = [],
  isEditing = false,
  children
}: ClipPreviewPanelProps) {
  const normalizedVideoTitle = typeof videoTitle === 'string' ? videoTitle.trim() : '';
  const hasTags = Array.isArray(tags) && tags.length > 0;

  return (
    <aside className="artist-library__clip-preview" aria-live="polite">
      <header className="artist-library__clip-preview-header">
        <span className="artist-library__clip-preview-label">선택된 클립 미리보기</span>
        {isEditing && <span className="artist-library__clip-preview-badge">편집 중</span>}
      </header>
      <div className="artist-library__clip-preview-body">
        <div className="artist-library__clip-preview-meta">
          {normalizedVideoTitle && (
            <p className="artist-library__clip-preview-video" title={normalizedVideoTitle}>
              {normalizedVideoTitle}
            </p>
          )}
          <h5 className="artist-library__clip-preview-title" title={clipTitle}>
            {clipTitle}
          </h5>
          <p className="artist-library__clip-preview-range">{rangeLabel}</p>
          {hasTags && (
            <div className="artist-library__clip-preview-tags" aria-label="클립 태그">
              {tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="artist-library__clip-preview-player">{children}</div>
      </div>
    </aside>
  );
}
