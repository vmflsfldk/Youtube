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
    'language.option.ja': '日本語',
    'language.option.en': 'English',
    'language.option.koAria': '한국어로 보기',
    'language.option.jaAria': '일본어로 보기',
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
    'language.option.ja': '日本語',
    'language.option.en': 'English',
    'language.option.koAria': 'View in Korean',
    'language.option.jaAria': 'View in Japanese',
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
  },
  ja: {
    'app.brand': 'UtaHub',
    'app.title': 'UtaHub Studio',
    'header.eyebrow': 'UtaHub',
    'layout.sidebarNavLabel': '主要ナビゲーション',
    'layout.logoAlt': 'UtaHub ロゴ',
    'nav.library.label': 'アーティストライブラリ',
    'nav.library.description': '最新のアーティストと動画を探しましょう。',
    'nav.catalog.label': '楽曲カタログ',
    'nav.catalog.description': '登録された楽曲やクリップをアーティストや原曲制作者ごとに探せます。',
    'nav.playlist.label': '動画・クリップコレクション',
    'nav.playlist.description': '保存した動画とクリップを一目で確認できます。',
    'language.toggleLabel': '言語選択',
    'language.option.ko': '한국어',
    'language.option.ja': '日本語',
    'language.option.en': 'English',
    'language.option.koAria': '韓国語で表示',
    'language.option.jaAria': '日本語で表示',
    'language.option.enAria': '英語で表示',
    'auth.sectionLabelAuthenticated': 'アカウント管理',
    'auth.sectionLabelGuest': 'ログイン案内',
    'auth.headingAuthenticated': 'マイアカウント',
    'auth.headingGuest': 'ログイン',
    'auth.descriptionAuthenticated': 'ニックネームをすぐに編集してアカウントを管理しましょう。',
    'auth.descriptionGuest': 'アーティスト管理のために Google アカウントでログインしてください。',
    'auth.greetingLoading': 'ユーザー情報を読み込み中...',
    'auth.nicknameLabel': 'ニックネーム',
    'auth.nicknamePlaceholder': 'ニックネーム',
    'auth.nicknameSave': 'ニックネームを保存',
    'auth.signOut': 'ログアウト',
    'auth.googleLoading': 'Google ログインを準備中...',
    'auth.googleDescription': 'Google アカウントでログインするとすべての機能を利用できます。',
    'mobile.appbar.brand': 'UtaHub',
    'mobile.auth.overlayLabelAuthenticated': 'アカウント管理',
    'mobile.auth.overlayLabelGuest': 'ログイン',
    'mobile.auth.closeAriaLabel': 'ログインウィンドウを閉じる',
    'mobile.actions.filterOpen': 'フィルターを開く',
    'mobile.actions.filterClose': 'フィルターを閉じる',
    'mobile.actions.authOpenAuthenticated': 'アカウント管理を開く',
    'mobile.actions.authOpenGuest': 'ログインパネルを開く'
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
