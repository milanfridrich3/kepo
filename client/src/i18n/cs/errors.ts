import type { MessageKey } from '../index';

/** Czech strings: errors. */
export const errors = {
  'error.notFound': 'Tohle jsme nenašli.',
  'error.tooLarge': 'Soubor je příliš velký na nahrání.',
  'error.tooMany': 'Příliš mnoho pokusů. Chvíli počkejte a zkuste to znovu.',
  'error.server': 'Něco se nepovedlo na naší straně. Zkuste to za chvíli znovu.',
  'error.generic': 'Něco se nepovedlo. Zkuste to prosím znovu.',
  'error.timeout': 'Trvalo to příliš dlouho. Zkontrolujte připojení a zkuste to znovu.',
  'error.network': 'Kepo se nepodařilo zastihnout. Zkontrolujte připojení a zkuste to znovu.',
  'error.unreadable': 'Kepo poslalo odpověď, které se nepodařilo porozumět. Zkuste to prosím znovu.',
  'error.sessionEnded': 'Vaše relace skončila. Přihlaste se prosím znovu.',
} satisfies Partial<Record<MessageKey, string>> & Record<string, string>;
