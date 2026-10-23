import type { MessageKey } from '../index';

/** Czech strings: ui. */
export const ui = {
  'ui.viewAll': 'Zobrazit vše',
  'ui.dialog.close': 'Zavřít',
  'ui.toast.dismiss': 'Zavřít oznámení',
  'ui.loading': 'Načítání',
  'ui.error.title': 'Něco se nepovedlo',
  'ui.error.retry': 'Zkusit znovu',
} satisfies Partial<Record<MessageKey, string>> & Record<string, string>;
