import { createContext, useContext } from 'react';
import { translations } from './translations.js';

const defaultDisplay = (greekText, englishText) => {
  if (!greekText) return englishText ?? greekText;
  return greekText;
};
const defaultAlternate = () => null;

export const LangContext = createContext({
  lang: 'el',
  setLang: () => {},
  t: translations.el,
  display: defaultDisplay,
  alternate: defaultAlternate,
});

export function useTranslation() {
  return useContext(LangContext);
}
