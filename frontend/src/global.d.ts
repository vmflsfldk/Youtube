export {};

declare global {
  interface Window {
    YT?: {
      PlayerState?: {
        ENDED?: number;
      };
    };
    google?: {
      accounts?: {
        id?: {
          initialize?: (options: {
            client_id: string;
            callback: (response: { credential?: string | undefined }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            prompt_parent_id?: string;
            use_fedcm_for_prompting?: boolean;
          }) => void;
          renderButton?: (
            element: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number | string;
              logo_alignment?: 'left' | 'center';
            }
          ) => void;
          prompt?: (momentListener?: (notification: unknown) => void) => void;
        };
      };
    };
  }
}
