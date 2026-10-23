import type { ItemFilterQuery } from '../types';
import { CURRENCIES } from '../types';
import { useI18n } from '../context/I18nContext';
import { Field, Input, Select } from './ui/Field';
import { Chip } from './ui/Controls';

const WARRANTY_OPTIONS = ['expired', 'expiring30', 'expiring90', 'active', 'none'] as const;
const SORT_OPTIONS = ['name', 'recent', 'updated', 'purchaseDate', 'value', 'warranty'] as const;

/** The advanced filters of the item list. Controlled: every change goes straight to the address via `onChange`. */
export function ItemFilterPanel({
  filter, onChange, tags,
}: {
  filter: ItemFilterQuery;
  onChange: (next: ItemFilterQuery) => void;
  tags: { tag: string; count: number }[];
}) {
  const { t } = useI18n();
  const set = (patch: Partial<ItemFilterQuery>) => {
    const next = { ...filter, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange(next as ItemFilterQuery);
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  const selectedTags = filter.tags ?? [];
  const toggleTag = (tag: string) => {
    const has = selectedTags.some(x => x.toLowerCase() === tag.toLowerCase());
    set({ tags: has ? selectedTags.filter(x => x.toLowerCase() !== tag.toLowerCase()) : [...selectedTags, tag] });
  };

  return (
    <div className="mb-4 space-y-4 rounded-card border border-line bg-surface p-4" role="region" aria-label={t('items.filters.title')}>
      {tags.length > 0 && (
        <div>
          <div className="mb-1.5 text-caption font-medium uppercase tracking-wide text-muted">{t('items.filters.tags')}</div>
          <div className="flex flex-wrap gap-2">
            {tags.map(x => (
              <Chip key={x.tag} selected={selectedTags.some(s => s.toLowerCase() === x.tag.toLowerCase())} onClick={() => toggleTag(x.tag)}>
                {x.tag} · {x.count}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
        <Field label={t('items.filters.warranty')} className="mb-0">
          <Select value={filter.warranty ?? ''} onChange={e => set({ warranty: (e.target.value || undefined) as ItemFilterQuery['warranty'] })}>
            <option value="">{t('items.filters.any')}</option>
            {WARRANTY_OPTIONS.map(w => <option key={w} value={w}>{t(`items.filters.warranty.${w}` as const)}</option>)}
          </Select>
        </Field>
        <Field label={t('items.filters.sort')} className="mb-0">
          <Select value={filter.sort ?? 'name'} onChange={e => set({ sort: e.target.value === 'name' ? undefined : e.target.value })}>
            {SORT_OPTIONS.map(s => <option key={s} value={s}>{t(`items.filters.sort.${s}` as const)}</option>)}
          </Select>
        </Field>
        <Field label={t('items.filters.show')} className="mb-0">
          <Select value={filter.archived ?? ''} onChange={e => set({ archived: (e.target.value || undefined) as ItemFilterQuery['archived'] })}>
            <option value="">{t('items.filters.show.active')}</option>
            <option value="only">{t('items.filters.show.removed')}</option>
            <option value="include">{t('items.filters.show.all')}</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
        <Field label={t('items.filters.valueMin')} className="mb-0">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={filter.valueMin ?? ''} onChange={e => set({ valueMin: num(e.target.value) })} />
        </Field>
        <Field label={t('items.filters.valueMax')} className="mb-0">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={filter.valueMax ?? ''} onChange={e => set({ valueMax: num(e.target.value) })} />
        </Field>
        <Field label={t('items.filters.currency')} className="mb-0">
          <Select value={filter.currency ?? ''} onChange={e => set({ currency: (e.target.value || undefined) as ItemFilterQuery['currency'] })}>
            <option value="">{t('items.filters.any')}</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <div className="hidden sm:block" />
        <Field label={t('items.filters.purchasedFrom')} className="mb-0">
          <Input type="date" value={filter.purchasedFrom ?? ''} onChange={e => set({ purchasedFrom: e.target.value || undefined })} />
        </Field>
        <Field label={t('items.filters.purchasedTo')} className="mb-0">
          <Input type="date" value={filter.purchasedTo ?? ''} onChange={e => set({ purchasedTo: e.target.value || undefined })} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="inline-flex items-center gap-2 text-body text-ink">
          <input type="checkbox" checked={filter.hasPhoto === true} onChange={e => set({ hasPhoto: e.target.checked ? true : undefined })} className="h-4 w-4" />
          {t('items.filters.hasPhoto')}
        </label>
        <label className="inline-flex items-center gap-2 text-body text-ink">
          <input type="checkbox" checked={filter.hasDocuments === true} onChange={e => set({ hasDocuments: e.target.checked ? true : undefined })} className="h-4 w-4" />
          {t('items.filters.hasDocuments')}
        </label>
      </div>
    </div>
  );
}
