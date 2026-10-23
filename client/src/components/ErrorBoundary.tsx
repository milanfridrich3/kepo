import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { t } from '../i18n';

/**
 * Last line of defence: an unexpected error while rendering shows a calm message with a reload button
 * instead of a blank page. Nothing about the error is shown or sent anywhere (it is only written to the
 * browser console for whoever debugs it). Uses the global `t` so it still works if a provider failed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center text-ink">
        <h1 className="text-title">{t('error.boundary.title')}</h1>
        <p className="mt-2 max-w-sm text-meta text-muted">{t('error.boundary.body')}</p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-control bg-accent px-4 py-2 text-body font-medium text-white">
            {t('error.boundary.reload')}
          </button>
          <button type="button" onClick={() => { window.location.href = '/'; }} className="rounded-control border border-line px-4 py-2 text-body font-medium">
            {t('error.boundary.home')}
          </button>
        </div>
      </div>
    );
  }
}
