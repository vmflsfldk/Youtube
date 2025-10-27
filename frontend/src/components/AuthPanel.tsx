import { FormEvent, useId } from 'react';
import GoogleLoginButton from './GoogleLoginButton';
import { useTranslations } from '../locales/translations';

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
  shouldAutoPromptGoogle?: boolean;
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
  onGoogleCredential,
  shouldAutoPromptGoogle = false
}: AuthPanelProps) {
  const nicknameInputId = useId();
  const translate = useTranslations();
  const sectionLabel = isAuthenticated
    ? translate('auth.sectionLabelAuthenticated')
    : translate('auth.sectionLabelGuest');
  const heading = isAuthenticated
    ? translate('auth.headingAuthenticated')
    : translate('auth.headingGuest');
  const description = isAuthenticated
    ? translate('auth.descriptionAuthenticated')
    : translate('auth.descriptionGuest');

  return (
    <section
      className={`auth-panel sidebar__auth-card${className ? ` ${className}` : ''}`}
      aria-label={sectionLabel}
      tabIndex={-1}
    >
      <div className="sidebar__auth-header">
        <h2>{heading}</h2>
        <p>{description}</p>
      </div>
      {isAuthenticated ? (
        <div className="sidebar__auth-content">
          <p className="login-status__message">{greetingMessage}</p>
          {isLoadingUser && (
            <p className="sidebar__auth-muted">{translate('auth.greetingLoading')}</p>
          )}
          <form className="stacked-form sidebar__nickname-form" onSubmit={onNicknameSubmit}>
            <label htmlFor={nicknameInputId}>{translate('auth.nicknameLabel')}</label>
            <input
              id={nicknameInputId}
              placeholder={translate('auth.nicknamePlaceholder')}
              value={nicknameInput}
              onChange={(event) => onNicknameInputChange(event.target.value)}
            />
            <button type="submit">{translate('auth.nicknameSave')}</button>
          </form>
          {nicknameStatus && <p className="login-status__message">{nicknameStatus}</p>}
          {nicknameError && <p className="login-status__message error">{nicknameError}</p>}
          <div className="sidebar__auth-actions">
            <button type="button" onClick={onSignOut} className="sidebar__auth-button">
              {translate('auth.signOut')}
            </button>
          </div>
        </div>
      ) : (
        <div className="sidebar__auth-content sidebar__auth-content--guest">
          <div className="sidebar__auth-social">
            {isGoogleReady ? (
              <GoogleLoginButton
                clientId={GOOGLE_CLIENT_ID}
                onCredential={onGoogleCredential}
                autoPrompt={shouldAutoPromptGoogle}
              />
            ) : (
              <span className="sidebar__auth-muted">{translate('auth.googleLoading')}</span>
            )}
          </div>
          <p className="sidebar__auth-muted">{translate('auth.googleDescription')}</p>
        </div>
      )}
    </section>
  );
}
