import { Locale, SUPPORTED_LOCALES, useLanguage } from '../contexts/LanguageContext';
import { useTranslations } from '../locales/translations';

type LanguageToggleProps = {
  className?: string;
  variant?: 'default' | 'compact';
};

const LANGUAGE_DISPLAY_ORDER: Locale[] = SUPPORTED_LOCALES.slice();

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
        const labelKey = option === 'ko' ? 'language.option.ko' : 'language.option.en';
        const ariaKey = option === 'ko' ? 'language.option.koAria' : 'language.option.enAria';
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
