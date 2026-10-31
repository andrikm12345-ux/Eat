// Camera barcode scanning: native BarcodeDetector when available (Android Chrome),
// otherwise ZXing (lazy chunk).

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export type ScanHandle = { stop: () => void };
export type ScanError = 'denied' | 'unavailable';

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Ctor({ formats }) : null;
  } catch {
    return null;
  }
}

/** Starts scanning into `video`; calls `onCode` once per distinct code. */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScanHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw 'unavailable' satisfies ScanError;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw (
      name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
    ) satisfies ScanError;
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);

  let stopped = false;
  let last = '';
  const emit = (code: string) => {
    if (stopped || !code || code === last) return;
    last = code;
    onCode(code);
  };
  const stopStream = () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const detector = await nativeDetector();
  if (detector) {
    const tick = async () => {
      if (stopped) return;
      try {
        const found = await detector.detect(video);
        if (found[0]) emit(found[0].rawValue);
      } catch {
        /* frame not ready */
      }
      window.setTimeout(() => void tick(), 200);
    };
    void tick();
    return { stop: stopStream };
  }

  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) emit(result.getText());
  });
  return {
    stop: () => {
      controls.stop();
      stopStream();
    },
  };
}
