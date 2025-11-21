import { useEffect, useMemo, useState, type ClipboardEvent, type FormEvent } from 'react';
import VideoPreviewCard from './VideoPreviewCard';
import { extractYouTubeVideoId } from '../utils/videos';

type BadgeTone = 'muted' | 'success' | 'warning' | 'danger';

interface VideoLinkInputProps {
  id?: string;
  label?: string;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  submitButtonType?: 'button' | 'submit';
  showSubmitButton?: boolean;
  asForm?: boolean;
  existingVideoIds?: Iterable<string | null | undefined>;
  helperText?: string | null;
  helperTone?: 'info' | 'error' | 'success';
  onChange: (value: string) => void;
  onSubmit?: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export const VideoLinkInput = ({
  id,
  label = 'YouTube 링크',
  placeholder = 'https://www.youtube.com/watch?v=...',
  value,
  disabled = false,
  isSubmitting = false,
  submitLabel = '확인',
  submitButtonType = 'submit',
  showSubmitButton = true,
  asForm = true,
  existingVideoIds,
  helperText,
  helperTone = 'info',
  onChange,
  onSubmit
}: VideoLinkInputProps) => {
  const existingIdSet = useMemo(() => {
    const set = new Set<string>();
    if (!existingVideoIds) {
      return set;
    }
    for (const id of existingVideoIds) {
      const normalized = (id ?? '').trim();
      if (normalized.length > 0) {
        set.add(normalized);
      }
    }
    return set;
  }, [existingVideoIds]);

  const [videoId, setVideoId] = useState<string | null>(extractYouTubeVideoId(value));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setVideoId(extractYouTubeVideoId(value));
    }, 320);

    return () => window.clearTimeout(timeout);
  }, [value]);

  const trimmedValue = value.trim();
  const alreadyRegistered = videoId ? existingIdSet.has(videoId) : false;

  const status = useMemo((): { label: string; tone: BadgeTone } => {
    if (!trimmedValue) {
      return { label: '링크 입력 대기', tone: 'muted' };
    }
    if (videoId && alreadyRegistered) {
      return { label: '이미 등록된 영상', tone: 'warning' };
    }
    if (videoId) {
      return { label: '등록 가능', tone: 'success' };
    }
    return { label: '링크를 확인하세요', tone: 'danger' };
  }, [alreadyRegistered, trimmedValue, videoId]);

  const badgeClass = `video-link-input__badge video-link-input__badge--${status.tone}`;
  const helperClass = `video-link-input__helper${
    helperTone === 'error' ? ' video-link-input__helper--error' : ''
  }${helperTone === 'success' ? ' video-link-input__helper--success' : ''}`;

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData?.getData('text');
    if (pastedText) {
      const parsedId = extractYouTubeVideoId(pastedText);
      if (parsedId) {
        setVideoId(parsedId);
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(event);
  };

  const content = (
    <>
      <div className="video-link-input__header">
        <label className="video-link-input__label" htmlFor={id}>
          {label}
        </label>
        <span className={badgeClass}>{status.label}</span>
      </div>
      <div className="video-link-input__control">
        <input
          id={id}
          type="url"
          inputMode="url"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-invalid={status.tone === 'danger'}
        />
        {showSubmitButton && (
          <button
            type={asForm ? submitButtonType : 'button'}
            onClick={!asForm ? () => onSubmit?.() : undefined}
            disabled={disabled || isSubmitting}
          >
            {submitLabel}
          </button>
        )}
      </div>
      {helperText && <p className={helperClass}>{helperText}</p>}
      <VideoPreviewCard
        url={value}
        statusLabel={status.label}
        statusTone={status.tone === 'muted' ? 'info' : status.tone === 'danger' ? 'danger' : status.tone}
      />
    </>
  );

  if (asForm) {
    return (
      <form className="video-link-input" onSubmit={handleSubmit}>
        {content}
      </form>
    );
  }

  return <div className="video-link-input">{content}</div>;
};

export default VideoLinkInput;
