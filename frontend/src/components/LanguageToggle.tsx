import { Locale, SUPPORTED_LOCALES, useLanguage } from '../contexts/LanguageContext';
import { TranslationKey, useTranslations } from '../locales/translations';

type LanguageToggleProps = {
  className?: string;
  variant?: 'default' | 'compact';
};

const LANGUAGE_DISPLAY_ORDER: Locale[] = SUPPORTED_LOCALES.slice();

const LANGUAGE_KEY_MAP: Record<Locale, { label: TranslationKey; aria: TranslationKey }> = {
  ko: {
    label: 'language.option.ko',
    aria: 'language.option.koAria'
  },
  ja: {
    label: 'language.option.ja',
    aria: 'language.option.jaAria'
  },
  en: {
    label: 'language.option.en',
    aria: 'language.option.enAria'
  }
};

export default function LanguageToggle({ className = '', variant = 'default' }: LanguageToggleProps) {
  const { locale, setLocale } = useLanguage();
  const translate = useTranslations();
  const rootClassName = [
    'language-toggle',
    variant === 'compact' ? 'language-toggle--compact' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName} role="group" aria-label={translate('language.toggleLabel')}>
      {LANGUAGE_DISPLAY_ORDER.map((option) => {
        const isActive = option === locale;
        const { label: labelKey, aria: ariaKey } = LANGUAGE_KEY_MAP[option];
        const buttonClassName = ['language-toggle__button', isActive ? 'is-active' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={option}
            type="button"
            className={buttonClassName}
            aria-pressed={isActive}
            aria-label={translate(ariaKey)}
            onClick={() => setLocale(option)}
          >
            {translate(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
