import { LegalPage } from './legal/LegalPage';
import type { LegalSection } from './legal/LegalPage';
import type { TranslationKey } from '../i18n';

const KEYS = ['account', 'content', 'household', 'feedback', 'email', 'providers', 'technical', 'basis', 'retention', 'export', 'rights', 'security', 'automated', 'changes'] as const;
const SECTIONS: LegalSection[] = KEYS.map(k => ({ title: `privacy.${k}.title` as TranslationKey, body: `privacy.${k}.body` as TranslationKey }));

/** Public privacy policy (CS/EN). The operator is named in the legal.operator.* texts. */
export function Privacy() {
  return <LegalPage title="privacy.title" sections={SECTIONS} other={{ to: '/terms', label: 'legal.terms.link' }} />;
}
