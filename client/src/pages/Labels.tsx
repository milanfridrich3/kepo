import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Item, Location } from '../types';
import { useI18n } from '../context/I18nContext';
import { Button } from '../components/ui/Button';
import { PageHeader, Section } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/Controls';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { QrImage } from '../components/QrImage';
import { isNativeApp } from '../lib/download';
import { pathStr, sortedByPath } from '../lib/format';
import { PUBLIC_APP_ORIGIN, labelPayload, labelShortCode } from '../lib/labels';
import type { LabelTarget } from '../lib/labels';

type Size = 'small' | 'medium' | 'large';
const SIZE_PX: Record<Size, number> = { small: 96, medium: 128, large: 176 };
const key = (k: 'item' | 'location', id: number) => `${k}:${id}`;

/** Printable QR labels for items and places. The QR holds only a link to the item or place, never its contents. */
export function Labels() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [items, setItems] = useState<Item[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const i = Number(params.get('item')); if (Number.isInteger(i) && i > 0) s.add(key('item', i));
    const l = Number(params.get('location')); if (Number.isInteger(l) && l > 0) s.add(key('location', l));
    return s;
  });
  const [size, setSize] = useState<Size>('medium');
  const native = isNativeApp();
  const origin = native ? PUBLIC_APP_ORIGIN : window.location.origin;

  useEffect(() => {
    Promise.all([api.items(), api.locations()])
      .then(([i, l]) => { setItems(i.items); setLocations(l.locations); })
      .catch(err => setError(err.message));
  }, []);

  const targets: LabelTarget[] = useMemo(() => {
    if (!items || !locations) return [];
    const out: LabelTarget[] = [];
    for (const l of sortedByPath(locations)) if (chosen.has(key('location', l.id))) out.push({ kind: 'location', id: l.id, title: l.name, subtitle: pathStr(l.id, locations) });
    for (const i of items) if (chosen.has(key('item', i.id))) out.push({ kind: 'item', id: i.id, title: i.name, subtitle: i.locationId ? pathStr(i.locationId, locations) : '' });
    return out;
  }, [items, locations, chosen]);

  const toggle = (k: string) => setChosen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const header = <PageHeader title={t('labels.title')} subtitle={t('labels.subtitle')} />;
  if (error) return (<>{header}<ErrorState message={error} /></>);
  if (!items || !locations) return (<div role="status" aria-label={t('common.loading')}>{header}<Skeleton className="h-40 w-full" /></div>);
  if (items.length === 0 && locations.length === 0) return (<>{header}<EmptyState icon="items" title={t('labels.empty.title')} body={t('labels.empty.body')} /></>);

  return (
    <div>
      {header}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('labels.places')} count={locations.length}>
          <ul className="max-h-72 divide-y divide-line overflow-auto">
            {sortedByPath(locations).map(l => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <input type="checkbox" className="h-4 w-4" checked={chosen.has(key('location', l.id))} onChange={() => toggle(key('location', l.id))} />
                  <span className="truncate text-body text-ink">{pathStr(l.id, locations)}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t('labels.items')} count={items.length}>
          <ul className="max-h-72 divide-y divide-line overflow-auto">
            {items.map(i => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <input type="checkbox" className="h-4 w-4" checked={chosen.has(key('item', i.id))} onChange={() => toggle(key('item', i.id))} />
                  <span className="truncate text-body text-ink">{i.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="my-5 flex flex-wrap items-center gap-3">
        <SegmentedControl<Size>
          label={t('labels.size')}
          value={size}
          onChange={setSize}
          options={[{ value: 'small', label: t('labels.size.small') }, { value: 'medium', label: t('labels.size.medium') }, { value: 'large', label: t('labels.size.large') }]}
        />
        <Button variant="primary" disabled={targets.length === 0 || native} onClick={() => window.print()}>
          {t('labels.print', { count: targets.length })}
        </Button>
        {native && <span className="text-caption text-muted">{t('labels.nativeNote')}</span>}
      </div>

      {targets.length > 0 && (
        <div className="print-sheet grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${SIZE_PX[size] + 40}px, 1fr))` }} aria-label={t('labels.preview')}>
          {targets.map(tg => (
            <div key={`${tg.kind}-${tg.id}`} className="print-label flex flex-col items-center rounded-control border border-line bg-white p-3 text-center text-black">
              <QrImage text={labelPayload(tg, origin)} size={SIZE_PX[size]} label={t('labels.qrFor', { name: tg.title })} />
              <div className="mt-2 w-full break-words text-body font-semibold leading-tight">{tg.title}</div>
              {tg.subtitle && <div className="w-full break-words text-caption leading-tight text-neutral-600">{tg.subtitle}</div>}
              <div className="mt-1 font-mono text-caption text-neutral-500">{labelShortCode(tg)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
