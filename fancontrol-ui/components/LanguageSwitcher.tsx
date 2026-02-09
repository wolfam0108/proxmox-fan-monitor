import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'ru' ? 'en' : 'ru';
        i18n.changeLanguage(newLang);
    };

    return (
        <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
            title={i18n.language === 'ru' ? 'Switch to English' : 'Переключить на Русский'}
        >
            <Globe size={16} />
            <span className="text-sm font-medium uppercase">{i18n.language}</span>
        </button>
    );
};
