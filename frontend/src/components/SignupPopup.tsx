import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SignupPopupProps {
  open: boolean;
  onClose: () => void;
  email: string;
  onEmailChange: (value: string) => void;
  phase: 'idle' | 'code-sent';
  onRequestCode: (event: FormEvent<HTMLFormElement>) => void;
  code: string;
  onCodeChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  passwordConfirm: string;
  onPasswordConfirmChange: (value: string) => void;
  onVerify: (event: FormEvent<HTMLFormElement>) => void;
  message: string | null;
  error: string | null;
  debugCode: string | null;
}

const POPUP_FEATURES = 'width=480,height=640,resizable=yes,scrollbars=yes';

export default function SignupPopup(props: SignupPopupProps) {
  const {
    open,
    onClose,
    email,
    onEmailChange,
    phase,
    onRequestCode,
    code,
    onCodeChange,
    password,
    onPasswordChange,
    passwordConfirm,
    onPasswordConfirmChange,
    onVerify,
    message,
    error,
    debugCode
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!open) {
      if (popupRef.current) {
        popupRef.current.close();
      }
      popupRef.current = null;
      containerRef.current = null;
      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
      setIsReady(false);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const popup = window.open('', 'signup-popup', POPUP_FEATURES);
    if (!popup) {
      console.warn('Unable to open signup popup window');
      onClose();
      return;
    }

    popup.document.title = '회원가입';
    popup.document.body.innerHTML = '';
    popup.document.body.style.margin = '0';
    popup.document.body.style.background = '#020617';

    const styleElement = popup.document.createElement('style');
    styleElement.textContent = `
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        font-family: 'Pretendard', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: radial-gradient(circle at top left, rgba(99, 102, 241, 0.25), transparent 55%),
          radial-gradient(circle at bottom right, rgba(34, 211, 238, 0.2), transparent 50%), #020617;
        color: #e2e8f0;
      }
      button {
        cursor: pointer;
      }
    `;
    popup.document.head.appendChild(styleElement);
    styleElementRef.current = styleElement;

    const container = popup.document.createElement('div');
    container.style.minHeight = '100vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.padding = '32px 28px';
    container.style.gap = '20px';
    container.style.maxWidth = '520px';
    container.style.margin = '0 auto';

    popup.document.body.appendChild(container);
    containerRef.current = container;
    popupRef.current = popup;
    setIsReady(true);

    const handleBeforeUnload = () => {
      onClose();
    };

    popup.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      popup.removeEventListener('beforeunload', handleBeforeUnload);
      popup.close();
      containerRef.current = null;
      popupRef.current = null;
      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
      setIsReady(false);
    };
  }, [open, onClose]);
  if (!open || !isReady || !containerRef.current) {
    return null;
  }

  return createPortal(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '24px',
        borderRadius: '24px',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        background: 'rgba(15, 23, 42, 0.88)',
        boxShadow: '0 24px 60px rgba(2, 6, 23, 0.65)'
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '-0.01em' }}>회원가입</h1>
        <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.5 }}>
          이메일 주소로 인증 코드를 발급받고 비밀번호를 설정해 계정을 만들어주세요.
        </p>
      </header>

      <form onSubmit={onRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label htmlFor="signupEmail" style={{ fontWeight: 600 }}>이메일 주소</label>
        <input
          id="signupEmail"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="example@email.com"
          required
          style={inputStyle}
        />
        <button type="submit" style={primaryButtonStyle}>
          인증 코드 받기
        </button>
      </form>

      {phase === 'code-sent' && (
        <form onSubmit={onVerify} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label htmlFor="signupCode" style={{ fontWeight: 600 }}>인증 코드</label>
          <input
            id="signupCode"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            placeholder="6자리 인증 코드"
            style={inputStyle}
          />

          <label htmlFor="signupPassword" style={{ fontWeight: 600 }}>비밀번호</label>
          <input
            id="signupPassword"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="비밀번호 (8자 이상)"
            style={inputStyle}
          />

          <label htmlFor="signupPasswordConfirm" style={{ fontWeight: 600 }}>비밀번호 확인</label>
          <input
            id="signupPasswordConfirm"
            type="password"
            value={passwordConfirm}
            onChange={(event) => onPasswordConfirmChange(event.target.value)}
            placeholder="비밀번호 다시 입력"
            style={inputStyle}
          />

          <button type="submit" style={primaryButtonStyle}>
            회원가입 완료
          </button>
        </form>
      )}

      {(message || error || debugCode) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {message && <span style={{ color: '#34d399', fontWeight: 600 }}>{message}</span>}
          {error && <span style={{ color: '#f87171', fontWeight: 600 }}>{error}</span>}
          {debugCode && (
            <span style={{ color: '#facc15', fontWeight: 600 }}>테스트용 코드: {debugCode}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        style={{
          ...secondaryButtonStyle,
          alignSelf: 'flex-end'
        }}
      >
        닫기
      </button>
    </div>,
    containerRef.current
  );
}

const inputStyle: CSSProperties = {
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  padding: '0.85rem 1.1rem',
  fontSize: '0.95rem',
  background: 'rgba(15, 23, 42, 0.65)',
  color: '#e2e8f0'
};

const baseButtonStyle: CSSProperties = {
  borderRadius: '14px',
  padding: '0.85rem 1.1rem',
  fontSize: '0.95rem',
  fontWeight: 600,
  border: 'none',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
  color: '#0f172a',
  boxShadow: '0 18px 36px rgba(59, 130, 246, 0.25)'
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'transparent',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  color: '#e2e8f0'
};
