import {
  SCREENSHOT_BUDGET_BYTES,
  SCREENSHOT_CONTENT_TYPE,
  SCREENSHOT_MAX_WIDTH,
  SCREENSHOT_QUALITY_STEPS,
} from '../types/constants';
import type { CapturedImage, Screenshot } from '../types/feedback';
import { stripDataUrlPrefix } from '../utils/image';

/** Retina displays report 2 or 3. Beyond 2 we pay a lot of pixels for nothing. */
const MAX_PIXEL_RATIO = 2;

/** Scale ladder for when quality reduction alone can't hit the budget. */
const SCALE_STEPS = [1, 0.75, 0.5, 0.35];

/**
 * Anything carrying this attribute is left out of a DOM capture. Use it for transient
 * chrome — toasts, tooltips — that shouldn't end up in the screenshot.
 */
export const IGNORE_ATTR = 'data-feedback-ignore';

/**
 * Rancher's app root: `position: absolute`, sized to exactly the viewport, and containing
 * the whole dashboard. Capturing it (rather than `document.body`) yields precisely the
 * screen the user is looking at. See @rancher/shell .../global/_layout.scss `.dashboard-root`.
 */
const DASHBOARD_ROOT = '.dashboard-root';

function captureTarget(): HTMLElement {
  return document.querySelector<HTMLElement>(DASHBOARD_ROOT) || document.body;
}

export class ScreenshotTooLargeError extends Error {
  constructor(readonly actualBytes: number, readonly budgetBytes: number) {
    super(`Screenshot is ${ Math.round(actualBytes / 1024) }KB after compression, over the ${ Math.round(budgetBytes / 1024) }KB budget.`);
    this.name = 'ScreenshotTooLargeError';
  }
}

function bodyBackgroundColor(): string {
  const bg = getComputedStyle(document.body).backgroundColor;

  // A transparent body would render black once flattened onto an opaque JPEG.
  return !bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bg;
}

function canvasToCaptured(canvas: HTMLCanvasElement): CapturedImage {
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width:   canvas.width,
    height:  canvas.height,
  };
}

/**
 * Renders the live DOM to a canvas with html2canvas. Silent — no permission prompt and
 * no screen-share indicator.
 *
 * We use html2canvas rather than an SVG/`foreignObject` renderer (html-to-image) because
 * that approach mis-places form controls: verified against a live Rancher dashboard, its
 * buttons rendered ~39px too low, while html2canvas reproduced them to within 1px.
 *
 * html2canvas is loaded on demand so it stays out of the extension's entry chunk.
 */
export async function captureDom(target: HTMLElement = captureTarget()): Promise<CapturedImage> {
  const { default: html2canvas } = await import(/* webpackChunkName: "html2canvas" */ 'html2canvas');

  const canvas = await html2canvas(target, {
    scale:           Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    backgroundColor: bodyBackgroundColor(),
    useCORS:         true,
    logging:         false,
    ignoreElements:  (el: Element) => (el as HTMLElement).hasAttribute?.(IGNORE_ATTR),
  });

  return canvasToCaptured(canvas);
}

/**
 * Takes a true pixel screenshot of the current tab via the browser's own screen-capture
 * pipeline. Pixel-perfect, but costs a "Share this tab" prompt each time — so it is the
 * opt-in "re-capture" path and the fallback when html2canvas fails (e.g. a tainted canvas
 * from a cross-origin image).
 *
 * Must be called from a user gesture. Rejects with `NotAllowedError` if the user
 * dismisses the picker; callers treat that as a cancellation, not a failure.
 */
export async function captureDisplayMedia(): Promise<CapturedImage> {
  const media = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (c: unknown) => Promise<MediaStream> };

  if (!media?.getDisplayMedia) {
    throw new Error('This browser cannot capture the screen. Use Chrome, Edge or Firefox.');
  }

  const stream = await media.getDisplayMedia({
    video:            { displaySurface: 'browser' },
    audio:            false,
    // Chrome/Edge: pre-selects the current tab so it is a single click.
    preferCurrentTab: true,
  });

  try {
    const video = document.createElement('video');

    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // A frame must be decoded before the video reports real dimensions.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    video.srcObject = null;

    return canvasToCaptured(canvas);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * The default capture the header action uses. Silent (html2canvas) by design — it never
 * triggers a permission prompt. On failure it throws rather than falling back to
 * `captureDisplayMedia()`, so the browser's screen-share prompt is only ever raised by an
 * explicit user click (the "Take screenshot" / re-capture button), never automatically.
 */
export async function captureScreen(): Promise<CapturedImage> {
  return captureDom();
}

function rescale(source: HTMLCanvasElement, scale: number, background: string): HTMLCanvasElement {
  if (scale === 1) {
    return source;
  }

  const out = document.createElement('canvas');

  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));

  const ctx = out.getContext('2d')!;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);

  return out;
}

/**
 * Flattens a canvas onto an opaque background and encodes it as JPEG, walking quality
 * down and then resolution down until the base64 payload fits the CR's size budget.
 *
 * We compress here, in the browser, rather than letting the API server reject an oversized
 * object: the user gets told before they lose their annotations.
 *
 * @throws {ScreenshotTooLargeError} when even the smallest encoding doesn't fit.
 */
export function compressToBudget(
  source: HTMLCanvasElement,
  budgetBytes: number = SCREENSHOT_BUDGET_BYTES,
): Screenshot {
  const background = '#ffffff';

  // Bring an oversized (or retina) capture down before we start on quality.
  const initial = source.width > SCREENSHOT_MAX_WIDTH
    ? rescale(source, SCREENSHOT_MAX_WIDTH / source.width, background)
    : rescale(source, 1, background);

  let smallest = Number.POSITIVE_INFINITY;

  for (const scale of SCALE_STEPS) {
    const canvas = rescale(initial, scale, background);
    // JPEG has no alpha; without this, transparent regions flatten to black.
    const opaque = flattenOnto(canvas, background);

    for (const quality of SCREENSHOT_QUALITY_STEPS) {
      const data = stripDataUrlPrefix(opaque.toDataURL(SCREENSHOT_CONTENT_TYPE, quality));

      smallest = Math.min(smallest, data.length);

      if (data.length <= budgetBytes) {
        return {
          contentType: SCREENSHOT_CONTENT_TYPE,
          encoding:    'base64',
          width:       opaque.width,
          height:      opaque.height,
          data,
        };
      }
    }
  }

  throw new ScreenshotTooLargeError(smallest, budgetBytes);
}

function flattenOnto(source: HTMLCanvasElement, background: string): HTMLCanvasElement {
  const out = document.createElement('canvas');

  out.width = source.width;
  out.height = source.height;

  const ctx = out.getContext('2d')!;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);

  return out;
}
