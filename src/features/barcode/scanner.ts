import type * as ZxLib from '@zxing/library';

// Camera barcode scanning. The video is requested sharp (up to 1080p) with continuous focus
// and some zoom; frames are read by the native BarcodeDetector when there is one, otherwise
// by ZXing on the middle band of the frame, every 50 ms (the library's own video loop checks
// only twice a second).

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export type ScanHandle = { stop: () => void };
export type ScanError = 'denied' | 'unavailable';

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? NATIVE_FORMATS;
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Ctor({ formats }) : null;
  } catch {
    return null;
  }
}

type Zx = typeof ZxLib;
let zxPromise: Promise<{ zx: Zx; reader: InstanceType<Zx['MultiFormatReader']> }> | null = null;

/** Loads ZXing once (lazy chunk) with the formats of food packaging. */
function loadReader() {
  zxPromise ??= import('@zxing/library').then((zx) => {
    const reader = new zx.MultiFormatReader();
    const hints = new Map();
    hints.set(zx.DecodeHintType.POSSIBLE_FORMATS, [
      zx.BarcodeFormat.EAN_13,
      zx.BarcodeFormat.EAN_8,
      zx.BarcodeFormat.UPC_A,
      zx.BarcodeFormat.UPC_E,
      zx.BarcodeFormat.CODE_128,
    ]);
    hints.set(zx.DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
    return { zx, reader };
  });
  return zxPromise;
}

/** Decodes one canvas; null when there is no readable code in it. */
async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const { zx, reader } = await loadReader();
  try {
    const source = new zx.HTMLCanvasElementLuminanceSource(canvas);
    return reader.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(source))).getText();
  } catch {
    return null;
  }
}

/** Draws a part of an image source onto a scratch canvas, scaled down to `maxWidth`. */
function drawPart(
  canvas: HTMLCanvasElement,
  src: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxWidth: number,
): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || sw <= 0 || sh <= 0) return false;
  const scale = Math.min(1, maxWidth / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return true;
}

/** Reads a barcode from a photo (full resolution, focused by the camera app). */
export async function decodePhoto(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const w = bitmap.width;
    const h = bitmap.height;
    // The whole photo, then its middle band at full detail, then a tighter middle.
    const parts: [number, number, number, number][] = [
      [0, 0, w, h],
      [0, Math.round(h * 0.25), w, Math.round(h * 0.5)],
      [Math.round(w * 0.15), Math.round(h * 0.3), Math.round(w * 0.7), Math.round(h * 0.4)],
    ];
    for (const [x, y, pw, ph] of parts) {
      if (!drawPart(canvas, bitmap, x, y, pw, ph, 2000)) continue;
      const code = await decodeCanvas(canvas);
      if (code) return code;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Asks the camera for continuous focus and a little zoom where the browser allows it. */
async function tuneTrack(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = (track.getCapabilities?.() ?? {}) as {
      focusMode?: string[];
      zoom?: { min: number; max: number };
    };
    const advanced: Record<string, unknown>[] = [];
    if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
    // Zoom lets the phone stay at a distance where its lens can focus.
    if (caps.zoom && caps.zoom.max >= 2) advanced.push({ zoom: Math.max(caps.zoom.min, 1.6) });
    if (advanced.length) await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    /* not supported: the defaults are fine */
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
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
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
  await tuneTrack(stream);

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

  const native = await nativeDetector();
  if (!native) await loadReader().catch(() => undefined);
  const canvas = document.createElement('canvas');

  const tick = async () => {
    if (stopped) return;
    try {
      if (native) {
        const found = await native.detect(video);
        if (found[0]) emit(found[0].rawValue);
      } else if (video.videoWidth > 0) {
        // The middle band of the frame (where the viewfinder frame is), at most 1280 px wide.
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (drawPart(canvas, video, 0, Math.round(vh * 0.25), vw, Math.round(vh * 0.5), 1280)) {
          const code = await decodeCanvas(canvas);
          if (code) emit(code);
        }
      }
    } catch {
      /* frame not ready */
    }
    window.setTimeout(() => void tick(), native ? 150 : 50);
  };
  void tick();
  return { stop: stopStream };
}
