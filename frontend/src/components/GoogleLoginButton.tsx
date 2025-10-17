import { useEffect, useRef } from 'react';

interface GoogleLoginButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
}

const BUTTON_OPTIONS = {
  theme: 'outline' as const,
  size: 'large' as const,
  text: 'signin_with' as const
};

export default function GoogleLoginButton({ clientId, onCredential }: GoogleLoginButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const googleId = window.google?.accounts?.id;
    if (!googleId || !buttonRef.current || !googleId.initialize || !googleId.renderButton) {
      return;
    }

    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
        }
      },
      use_fedcm_for_prompting: false
    });

    googleId.renderButton(buttonRef.current, BUTTON_OPTIONS);

    const ensureFullWidth = () => {
      const root = buttonRef.current;
      if (!root) {
        return;
      }

      root.style.width = '100%';

      const innerWrapper = root.firstElementChild as HTMLElement | null;
      if (innerWrapper) {
        innerWrapper.style.width = '100%';
        innerWrapper.style.maxWidth = '100%';
      }

      const buttonElement = root.querySelector('[role="button"]') as HTMLElement | null;
      if (buttonElement) {
        buttonElement.style.width = '100%';
        buttonElement.style.maxWidth = '100%';
        buttonElement.style.minHeight = '52px';
      }

      const iframeElement = root.querySelector('iframe') as HTMLElement | null;
      if (iframeElement) {
        iframeElement.style.width = '100%';
      }
    };

    ensureFullWidth();
    if (googleId.prompt) {
      try {
        googleId.prompt();
      } catch (error) {
        console.warn('Google Identity Services prompt failed', error);
      }
    }
  }, [clientId, onCredential]);

  return <div ref={buttonRef} className="google-login-button" />;
}
