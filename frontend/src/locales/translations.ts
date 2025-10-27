import { useCallback } from 'react';
import { DEFAULT_LOCALE, Locale, SUPPORTED_LOCALES, useLanguage } from '../contexts/LanguageContext';

type TranslationDictionary = Record<string, string>;

type Translations = Record<Locale, TranslationDictionary>;

const translations: Translations = {
  ko: {
    'app.brand': 'UtaHub',
    'app.title': 'UtaHub Studio',
    'header.eyebrow': 'UtaHub',
    'layout.sidebarNavLabel': '주요 탐색',
    'layout.logoAlt': 'UtaHub 로고',
    'nav.library.label': '아티스트 라이브러리',
    'nav.library.description': '최신 아티스트 목록과 영상을 탐색하세요.',
    'nav.catalog.label': '곡 DB',
    'nav.catalog.description': '등록된 곡과 클립을 아티스트·원곡자 기준으로 찾아보세요.',
    'nav.playlist.label': '영상·클립 모음',
    'nav.playlist.description': '저장된 영상과 클립을 한눈에 확인하세요.',
    'language.toggleLabel': '언어 선택',
    'language.option.ko': '한국어',
    'language.option.en': 'English',
    'language.option.koAria': '한국어로 보기',
    'language.option.enAria': '영어로 보기',
    'auth.sectionLabelAuthenticated': '계정 관리',
    'auth.sectionLabelGuest': '로그인 안내',
    'auth.headingAuthenticated': '내 계정',
    'auth.headingGuest': '로그인',
    'auth.descriptionAuthenticated': '닉네임을 바로 수정하고 계정을 관리하세요.',
    'auth.descriptionGuest': '아티스트 관리를 위해 Google 계정으로 로그인하세요.',
    'auth.greetingLoading': '사용자 정보를 불러오는 중...',
    'auth.nicknameLabel': '닉네임',
    'auth.nicknamePlaceholder': '닉네임',
    'auth.nicknameSave': '닉네임 저장',
    'auth.signOut': '로그아웃',
    'auth.googleLoading': '구글 로그인 준비 중...',
    'auth.googleDescription': 'Google 계정으로 로그인 후 전체 기능을 이용할 수 있습니다.',
    'mobile.appbar.brand': 'UtaHub',
    'mobile.auth.overlayLabelAuthenticated': '계정 관리',
    'mobile.auth.overlayLabelGuest': '로그인',
    'mobile.auth.closeAriaLabel': '로그인 창 닫기',
    'mobile.actions.filterOpen': '필터 열기',
    'mobile.actions.filterClose': '필터 닫기',
    'mobile.actions.authOpenAuthenticated': '계정 관리 열기',
    'mobile.actions.authOpenGuest': '로그인 패널 열기'
  },
  en: {
    'app.brand': 'UtaHub',
    'app.title': 'UtaHub Studio',
    'header.eyebrow': 'UtaHub',
    'layout.sidebarNavLabel': 'Primary navigation',
    'layout.logoAlt': 'UtaHub logo',
    'nav.library.label': 'Artist Library',
    'nav.library.description': 'Browse the latest artists and their videos.',
    'nav.catalog.label': 'Song Catalog',
    'nav.catalog.description': 'Find registered songs and clips by artist or composer.',
    'nav.playlist.label': 'Video & Clip Collections',
    'nav.playlist.description': 'Review saved videos and clips at a glance.',
    'language.toggleLabel': 'Language selection',
    'language.option.ko': '한국어',
    'language.option.en': 'English',
    'language.option.koAria': 'View in Korean',
    'language.option.enAria': 'View in English',
    'auth.sectionLabelAuthenticated': 'Account management',
    'auth.sectionLabelGuest': 'Sign-in guidance',
    'auth.headingAuthenticated': 'My Account',
    'auth.headingGuest': 'Sign in',
    'auth.descriptionAuthenticated': 'Update your nickname and manage your account instantly.',
    'auth.descriptionGuest': 'Sign in with Google to manage artists.',
    'auth.greetingLoading': 'Loading user information...',
    'auth.nicknameLabel': 'Nickname',
    'auth.nicknamePlaceholder': 'Nickname',
    'auth.nicknameSave': 'Save nickname',
    'auth.signOut': 'Sign out',
    'auth.googleLoading': 'Preparing Google sign-in...',
    'auth.googleDescription': 'Sign in with Google to unlock all features.',
    'mobile.appbar.brand': 'UtaHub',
    'mobile.auth.overlayLabelAuthenticated': 'Account management',
    'mobile.auth.overlayLabelGuest': 'Sign in',
    'mobile.auth.closeAriaLabel': 'Close sign-in dialog',
    'mobile.actions.filterOpen': 'Open filters',
    'mobile.actions.filterClose': 'Close filters',
    'mobile.actions.authOpenAuthenticated': 'Open account management',
    'mobile.actions.authOpenGuest': 'Open sign-in panel'
  }
};

export type TranslationKey = keyof (typeof translations)['ko'];

const fallbackLocale = DEFAULT_LOCALE;

export const translate = (locale: Locale, key: TranslationKey): string => {
  const table = translations[locale];
  if (table && key in table) {
    return table[key];
  }
  return translations[fallbackLocale][key] ?? key;
};

export const useTranslation = (key: TranslationKey): string => {
  const { locale } = useLanguage();
  return translate(locale, key);
};

export const useTranslations = (): ((key: TranslationKey) => string) => {
  const { locale } = useLanguage();
  return useCallback((key: TranslationKey) => translate(locale, key), [locale]);
};

export { translations as dictionaries, SUPPORTED_LOCALES };
