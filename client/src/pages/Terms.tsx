import { LegalPage } from './legal/LegalPage';
import type { LegalSection } from './legal/LegalPage';
import type { TranslationKey } from '../i18n';

const KEYS = ['service', 'account', 'use', 'content', 'sharing', 'deletion', 'suspension', 'availability', 'changes', 'law', 'contact'] as const;
const SECTIONS: LegalSection[] = KEYS.map(k => ({ title: `terms.${k}.title` as TranslationKey, body: `terms.${k}.body` as TranslationKey }));

/** Public terms of use (CS/EN). */
export function Terms() {
  return <LegalPage title="terms.title" sections={SECTIONS} other={{ to: '/privacy', label: 'privacy.link' }} />;
}
