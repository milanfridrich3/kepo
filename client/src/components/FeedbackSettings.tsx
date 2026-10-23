import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { FeedbackCategory } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui/Button';
import { Field, FormError, Select, Textarea } from './ui/Field';
import type { TranslationKey } from '../i18n';

const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;

const CATEGORIES: { value: FeedbackCategory; label: TranslationKey }[] = [
  { value: 'bug', label: 'settings.feedback.category.bug' },
  { value: 'idea', label: 'settings.feedback.category.idea' },
  { value: 'privacy', label: 'settings.feedback.category.privacy' },
  { value: 'other', label: 'settings.feedback.category.other' },
];

/** Settings → Feedback: Bug report, Idea, Privacy or Other. The server stores the message and notifies the operator. */
export function FeedbackSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sentKey, setSentKey] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    setSentKey(null);
    if (text.length === 0) { setError(t('settings.feedback.required')); return; }
    if (text.length < MIN_LENGTH) { setError(t('settings.feedback.tooShort', { min: MIN_LENGTH })); return; }
    setBusy(true);
    setError('');
    try {
      const result = await api.sendFeedback(category, text);
      // `notified` is false when the operator could not be told right now: the message is saved, and we say so instead of implying it was seen.
      const key = !result.notified ? 'settings.feedback.savedOnly' : category === 'privacy' ? 'settings.feedback.sentPrivacy' : 'settings.feedback.sent';
      setSentKey(key);
      toast.success(t(key));
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.feedback.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4">
      <p className="text-body font-medium text-ink">{t('settings.feedback.label')}</p>
      <p className="mb-3 text-meta text-muted">{t('settings.feedback.description')}</p>
      {error && <FormError message={error} />}
      {sentKey && <p role="status" className="mb-4 rounded-control bg-sunken px-3 py-2.5 text-meta text-ink">{t(sentKey)}</p>}
      <Field label={t('settings.feedback.category')} className="mb-3">
        <Select value={category} onChange={e => { setCategory(e.target.value as FeedbackCategory); setSentKey(null); }}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
        </Select>
      </Field>
      <Field label={t('settings.feedback.message')} hint={t(category === 'privacy' ? 'settings.feedback.hint.privacy' : 'settings.feedback.hint')} className="mb-1">
        <Textarea value={message} rows={5} maxLength={MAX_LENGTH} invalid={Boolean(error)} onChange={e => { setMessage(e.target.value); setSentKey(null); }} />
      </Field>
      <p className="mb-3 text-right text-caption text-faint" aria-hidden="true">{message.length}/{MAX_LENGTH}</p>
      <Button type="submit" variant="primary" size="sm" loading={busy}>{t('settings.feedback.submit')}</Button>
    </form>
  );
}
