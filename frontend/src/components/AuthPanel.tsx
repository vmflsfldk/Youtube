import { FormEvent, useId } from 'react';
import GoogleLoginButton from './GoogleLoginButton';

type AuthPanelProps = {
  className?: string;
  isAuthenticated: boolean;
  greetingMessage: string;
  isLoadingUser: boolean;
  nicknameInput: string;
  onNicknameInputChange: (value: string) => void;
  onNicknameSubmit: (event: FormEvent<HTMLFormElement>) => void;
  nicknameStatus: string | null;
  nicknameError: string | null;
  onSignOut: () => void;
  isGoogleReady: boolean;
  onGoogleCredential: (credential: string) => void;
};

const GOOGLE_CLIENT_ID = '245943329145-os94mkp21415hadulir67v1i0lqjrcnq.apps.googleusercontent.com';

export default function AuthPanel({
  className,
  isAuthenticated,
  greetingMessage,
  isLoadingUser,
  nicknameInput,
  onNicknameInputChange,
  onNicknameSubmit,
  nicknameStatus,
  nicknameError,
  onSignOut,
  isGoogleReady,
  onGoogleCredential
}: AuthPanelProps) {
  const nicknameInputId = useId();

  return (
    <section
      className={`auth-panel sidebar__auth-card${className ? ` ${className}` : ''}`}
      aria-label={isAuthenticated ? '계정 관리' : '로그인 안내'}
      tabIndex={-1}
    >
      <div className="sidebar__auth-header">
        <h2>{isAuthenticated ? '내 계정' : '로그인'}</h2>
        <p>
          {isAuthenticated
            ? '닉네임을 바로 수정하고 계정을 관리하세요.'
            : '아티스트 관리를 위해 Google 계정으로 로그인하세요.'}
        </p>
      </div>
      {isAuthenticated ? (
        <div className="sidebar__auth-content">
          <p className="login-status__message">{greetingMessage}</p>
          {isLoadingUser && <p className="sidebar__auth-muted">사용자 정보를 불러오는 중...</p>}
          <form className="stacked-form sidebar__nickname-form" onSubmit={onNicknameSubmit}>
            <label htmlFor={nicknameInputId}>닉네임</label>
            <input
              id={nicknameInputId}
              placeholder="닉네임"
              value={nicknameInput}
              onChange={(event) => onNicknameInputChange(event.target.value)}
            />
            <button type="submit">닉네임 저장</button>
          </form>
          {nicknameStatus && <p className="login-status__message">{nicknameStatus}</p>}
          {nicknameError && <p className="login-status__message error">{nicknameError}</p>}
          <div className="sidebar__auth-actions">
            <button type="button" onClick={onSignOut} className="sidebar__auth-button">
              로그아웃
            </button>
          </div>
        </div>
      ) : (
        <div className="sidebar__auth-content sidebar__auth-content--guest">
          <div className="sidebar__auth-social">
            {isGoogleReady ? (
              <GoogleLoginButton clientId={GOOGLE_CLIENT_ID} onCredential={onGoogleCredential} />
            ) : (
              <span className="sidebar__auth-muted">구글 로그인 준비 중...</span>
            )}
          </div>
          <p className="sidebar__auth-muted">Google 계정으로 로그인 후 전체 기능을 이용할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}
