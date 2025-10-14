import { useEffect, useRef } from 'react';

interface GoogleLoginButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
}

const BUTTON_OPTIONS = {
  theme: 'outline' as const,
  size: 'large' as const,
  text: 'signin_with' as const,
  width: 260
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
      }
    });

    googleId.renderButton(buttonRef.current, BUTTON_OPTIONS);
    googleId.prompt?.();
  }, [clientId, onCredential]);

  return <div ref={buttonRef} />;
}
