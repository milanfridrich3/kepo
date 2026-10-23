import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { FormError, Input } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { resolveScan } from '../lib/codes';

interface DetectedCode { rawValue: string }
interface Detector { detect(source: CanvasImageSource): Promise<DetectedCode[]> }
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;
const detectorCtor = (): DetectorCtor | null => ((window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null);

/**
 * Scan a Kepo label with the camera (where the browser supports BarcodeDetector) or type its text.
 * The camera is only used while this page is open and nothing is recorded or uploaded.
 */
export function Scan() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const supported = detectorCtor() !== null && typeof navigator.mediaDevices?.getUserMedia === 'function';

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);
  useEffect(() => stop, [stop]);

  const go = useCallback((text: string) => {
    const outcome = resolveScan(text);
    if (outcome.kind === 'empty') return false;
    stop();
    navigate(outcome.path);
    return true;
  }, [navigate, stop]);

  useEffect(() => {
    if (!active) return;
    const Ctor = detectorCtor();
    const video = videoRef.current;
    if (!Ctor || !video) return;
    const detector = new Ctor({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'] });
    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        if (found.length > 0 && go(found[0].rawValue)) window.clearInterval(timer);
      } catch { /* a frame that cannot be read is skipped */ }
      busy = false;
    }, 300);
    return () => window.clearInterval(timer);
  }, [active, go]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setActive(true);
      // The <video> exists once `active` renders; attach the stream on the next frame.
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); } });
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setError(t(denied ? 'scan.denied' : 'scan.cameraFailed'));
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); if (!go(manual)) setError(t('scan.empty')); };

  return (
    <div className="max-w-xl">
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />
      {error && <FormError message={error} />}
      <Card className="mb-5 overflow-hidden">
        {active ? (
          <div>
            <video ref={videoRef} muted playsInline className="aspect-square w-full bg-black object-cover" aria-label={t('scan.camera')} />
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="text-meta text-muted">{t('scan.aim')}</span>
              <Button size="sm" onClick={stop}>{t('scan.stop')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 p-4">
            {supported ? (
              <Button variant="primary" onClick={() => void start()}>
                <Icon name="camera" className="h-4 w-4" />
                {t('scan.start')}
              </Button>
            ) : (
              <p className="text-meta text-muted">{t('scan.unsupported')}</p>
            )}
            <p className="text-caption text-muted">{t('scan.privacy')}</p>
          </div>
        )}
      </Card>

      <form onSubmit={submit} className="flex gap-2">
        <Input aria-label={t('scan.manual')} placeholder={t('scan.manual.placeholder')} value={manual} onChange={e => setManual(e.target.value)} maxLength={200} autoComplete="off" />
        <Button type="submit" variant="primary">{t('scan.open')}</Button>
      </form>
      <p className="mt-2 text-caption text-muted">{t('scan.manual.hint')}</p>
    </div>
  );
}
