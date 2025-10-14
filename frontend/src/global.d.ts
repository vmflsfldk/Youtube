export {};

declare global {
  interface Window {
    YT?: {
      PlayerState?: {
        ENDED?: number;
      };
    };
  }
}
