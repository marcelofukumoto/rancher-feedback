import {
  Canvas, FabricImage, FabricObject, IText, Path, PencilBrush, Rect, util,
} from 'fabric';
import {
  onBeforeUnmount, onMounted, ref, watch, type Ref
} from 'vue';

import { HISTORY_LIMIT } from '../types/constants';
import type { CapturedImage } from '../types/feedback';
import { arrowPath, isTinyDrag, normalizeRect, type Point } from '../utils/geometry';

export type Tool = 'select' | 'pen' | 'arrow' | 'rect' | 'text' | 'redact' | 'crop';

/** Minimum drag, in image pixels, before a shape or crop marquee counts as intentional. */
const MIN_DRAG = 5;

/** Marks the dashed crop marquee so it is never treated as an annotation. */
const CROP_MARQUEE = 'isCropMarquee';

const DEFAULT_COLOR = '#e02020';
const DEFAULT_STROKE_WIDTH = 4;

/**
 * A history entry. Deliberately stores the annotation objects and the background's crop
 * window, never the background's `src` — that is a multi-megabyte data URL, and
 * serialising it 25 times over would cost hundreds of megabytes for no benefit.
 */
interface Snapshot {
  objects: object[];
  crop: {
    cropX: number; cropY: number; width: number; height: number;
  };
}

export interface UseScreenshotEditorOptions {
  canvasEl: Ref<HTMLCanvasElement | undefined>;
  stageEl: Ref<HTMLElement | undefined>;
  image: Ref<CapturedImage>;
}

export interface ScreenshotEditor {
  tool: Ref<Tool>;
  color: Ref<string>;
  strokeWidth: Ref<number>;
  canUndo: Ref<boolean>;
  canRedo: Ref<boolean>;
  canApplyCrop: Ref<boolean>;
  loading: Ref<boolean>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  reset: () => Promise<void>;
  applyCrop: () => void;
  cancelCrop: () => void;
  exportCanvas: () => HTMLCanvasElement;
}

/**
 * Owns the fabric.js canvas behind the screenshot editor: tools, undo/redo, crop, and
 * the flatten-on-export that produces the bytes we actually store.
 *
 * Every fabric object lives in a closure variable rather than in reactive state. Vue's
 * proxy would wrap the object graph fabric walks on each render — a correctness and
 * performance hazard — and the history snapshots would be deep-proxied for nothing.
 * Only the flags the template renders are refs.
 */
export function useScreenshotEditor(options: UseScreenshotEditorOptions): ScreenshotEditor {
  const { canvasEl, stageEl, image } = options;

  const tool = ref<Tool>('arrow');
  const color = ref(DEFAULT_COLOR);
  const strokeWidth = ref(DEFAULT_STROKE_WIDTH);
  const canUndo = ref(false);
  const canRedo = ref(false);
  const canApplyCrop = ref(false);
  const loading = ref(true);

  let canvas: Canvas;
  let bgImage: FabricImage;
  let history: Snapshot[] = [];
  let historyIndex = -1;
  let imageWidth = 0;
  let imageHeight = 0;

  let suppressHistory = false;
  let restoring = false;
  let drawing = false;
  let origin: Point | null = null;
  let preview: FabricObject | null = null;
  let cropMarquee: FabricObject | null = null;
  let resizeObserver: ResizeObserver | null = null;

  /**
   * Runs `fn` without recording history. Saves and restores the previous value rather
   * than clearing it, so nesting (applyCrop calls clearCropMarquee) behaves.
   */
  function withoutHistory<T>(fn: () => T): T {
    const previous = suppressHistory;

    suppressHistory = true;

    try {
      return fn();
    } finally {
      suppressHistory = previous;
    }
  }

  /* -------------------------------------------------------------------- history */

  function snapshot(): Snapshot {
    return {
      objects: canvas
        .getObjects()
        .filter((obj: any) => !obj[CROP_MARQUEE])
        .map((obj: any) => obj.toObject(['isRedaction'])),
      crop: {
        cropX:  bgImage.cropX,
        cropY:  bgImage.cropY,
        width:  bgImage.width,
        height: bgImage.height,
      },
    };
  }

  function syncHistoryFlags() {
    canUndo.value = historyIndex > 0;
    canRedo.value = historyIndex < history.length - 1;
  }

  function pushHistory() {
    if (suppressHistory || restoring || loading.value) {
      return;
    }

    history = history.slice(0, historyIndex + 1);
    history.push(snapshot());

    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }

    historyIndex = history.length - 1;
    syncHistoryFlags();
  }

  async function restore(entry: Snapshot) {
    restoring = true;

    try {
      canvas.remove(...canvas.getObjects());

      const objects = await util.enlivenObjects<FabricObject>(entry.objects as any[]);

      objects.forEach((obj) => canvas.add(obj));

      bgImage.set(entry.crop);
      imageWidth = entry.crop.width;
      imageHeight = entry.crop.height;

      fit();
      applyTool(tool.value);
    } finally {
      restoring = false;
    }

    syncHistoryFlags();
  }

  async function undo() {
    if (!canUndo.value) {
      return;
    }

    historyIndex -= 1;
    await restore(history[historyIndex]);
  }

  async function redo() {
    if (!canRedo.value) {
      return;
    }

    historyIndex += 1;
    await restore(history[historyIndex]);
  }

  async function reset() {
    if (!history.length) {
      return;
    }

    history = [history[0]];
    historyIndex = 0;
    await restore(history[0]);
  }

  /* -------------------------------------------------------------------- loading */

  async function loadImage(next: CapturedImage) {
    loading.value = true;

    const img = await FabricImage.fromURL(next.dataUrl, { crossOrigin: 'anonymous' });

    img.set({
      originX: 'left', originY: 'top', left: 0, top: 0, selectable: false, evented: false,
    });

    withoutHistory(() => {
      canvas.remove(...canvas.getObjects());
      canvas.backgroundImage = img;
    });

    bgImage = img;
    imageWidth = img.width;
    imageHeight = img.height;
    history = [];
    historyIndex = -1;

    fit();
    applyTool(tool.value);

    // The baseline snapshot backs both `reset()` and the first `undo()`, so it has to be
    // pushed after `loading` is cleared — `pushHistory` refuses to run while loading.
    loading.value = false;
    pushHistory();
  }

  /** Scale the canvas so the whole image fits the stage; never magnify past 1:1. */
  function fit() {
    const stage = stageEl.value;

    if (!stage || !imageWidth) {
      return;
    }

    const zoom = Math.min(
      stage.clientWidth / imageWidth,
      stage.clientHeight / imageHeight,
      1,
    );

    canvas.setDimensions({ width: imageWidth * zoom, height: imageHeight * zoom });
    canvas.setZoom(zoom);
    canvas.requestRenderAll();
  }

  /* ---------------------------------------------------------------------- tools */

  function applyTool(next: Tool) {
    if (!canvas) {
      return;
    }

    clearCropMarquee();

    const selecting = next === 'select';

    canvas.isDrawingMode = next === 'pen';
    canvas.selection = selecting;
    // Without this, dragging to draw would instead grab the annotation underneath.
    canvas.skipTargetFind = !selecting;
    canvas.defaultCursor = selecting ? 'default' : 'crosshair';

    canvas.getObjects().forEach((obj) => {
      obj.selectable = selecting;
      obj.evented = selecting;
    });

    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas);

      brush.color = color.value;
      brush.width = strokeWidth.value;
      canvas.freeDrawingBrush = brush;
    }

    if (!selecting) {
      canvas.discardActiveObject();
    }

    canvas.requestRenderAll();
  }

  /** Recolour the selection, so the swatches also act on existing annotations. */
  function restyleSelection() {
    const active = canvas?.getActiveObjects() || [];

    if (!active.length) {
      return;
    }

    active.forEach((obj: any) => {
      if (obj.type === 'i-text' || obj.isRedaction) {
        obj.set({ fill: color.value });
      } else {
        obj.set({ stroke: color.value, strokeWidth: strokeWidth.value });
      }
    });

    canvas.requestRenderAll();
    pushHistory();
  }

  /* ------------------------------------------------------------------ factories */

  function createArrow(from: Point, to: Point): FabricObject {
    const headLength = Math.max(12, strokeWidth.value * 3.5);

    return new Path(arrowPath(from, to, headLength), {
      fill:           '',
      stroke:         color.value,
      strokeWidth:    strokeWidth.value,
      strokeLineCap:  'round',
      strokeLineJoin: 'round',
      strokeUniform:  true,
      selectable:     false,
      evented:        false,
      objectCaching:  false,
    });
  }

  function createShape(point: Point): FabricObject | null {
    const base = {
      left: point.x, top: point.y, width: 0, height: 0, selectable: false, evented: false,
    };

    switch (tool.value) {
    case 'rect':
      return new Rect({
        ...base, fill: 'transparent', stroke: color.value, strokeWidth: strokeWidth.value, strokeUniform: true,
      });

    case 'redact':
      // Opaque fill, no stroke. On export the pixels underneath are genuinely gone, which
      // is the entire point — anything CSS-like would leave the secret in the file.
      return new Rect({
        ...base, fill: color.value, stroke: '', strokeWidth: 0, isRedaction: true,
      } as any);

    case 'arrow':
      return createArrow(point, point);

    default:
      return null;
    }
  }

  function createCropMarquee(point: Point): FabricObject {
    return new Rect({
      left:            point.x,
      top:             point.y,
      width:           0,
      height:          0,
      fill:            'rgba(0, 0, 0, 0.25)',
      stroke:          '#ffffff',
      strokeWidth:     1,
      strokeDashArray: [6, 4],
      strokeUniform:   true,
      selectable:      false,
      evented:         false,
      [CROP_MARQUEE]:  true,
    } as any);
  }

  function addText(point: Point) {
    const text = new IText('', {
      left:       point.x,
      top:        point.y,
      fill:       color.value,
      fontSize:   Math.max(16, strokeWidth.value * 5),
      fontFamily: 'Lato, Helvetica, Arial, sans-serif',
    });

    // Added empty, so not yet worth an undo step; `text:editing:exited` records it once
    // there is actually text.
    withoutHistory(() => canvas.add(text));
    canvas.setActiveObject(text);
    text.enterEditing();
  }

  /* ----------------------------------------------------------------------- crop */

  function clearCropMarquee() {
    if (cropMarquee) {
      const marquee = cropMarquee;

      cropMarquee = null;
      withoutHistory(() => canvas.remove(marquee));
    }

    canApplyCrop.value = false;
  }

  function cancelCrop() {
    clearCropMarquee();
    canvas.requestRenderAll();
  }

  /**
   * Moves the background's crop window rather than re-rasterising, and translates the
   * annotations to match. Nothing is flattened, so a cropped image stays editable and the
   * crop itself is undoable.
   */
  function applyCrop() {
    if (!cropMarquee) {
      return;
    }

    const left = Math.max(0, Math.round(cropMarquee.left));
    const top = Math.max(0, Math.round(cropMarquee.top));
    const width = Math.round(Math.min(cropMarquee.width, imageWidth - left));
    const height = Math.round(Math.min(cropMarquee.height, imageHeight - top));

    clearCropMarquee();

    if (width < MIN_DRAG || height < MIN_DRAG) {
      canvas.requestRenderAll();

      return;
    }

    withoutHistory(() => {
      bgImage.set({
        cropX: bgImage.cropX + left,
        cropY: bgImage.cropY + top,
        width,
        height,
      });

      canvas.getObjects().forEach((obj) => {
        obj.set({ left: obj.left - left, top: obj.top - top });
        obj.setCoords();
      });

      imageWidth = width;
      imageHeight = height;
      fit();
    });

    pushHistory();
    tool.value = 'select';
  }

  /* --------------------------------------------------------------------- events */

  function onMouseDown(opt: any) {
    if (tool.value === 'select' || tool.value === 'pen') {
      return;
    }

    const point = canvas.getScenePoint(opt.e);

    origin = point;

    if (tool.value === 'text') {
      addText(point);

      return;
    }

    // Everything else is a drag-to-size shape. Suppress history until mouse:up so one
    // gesture is one undo step, not one per mousemove.
    suppressHistory = true;
    drawing = true;
    preview = tool.value === 'crop' ? createCropMarquee(point) : createShape(point);

    if (preview) {
      canvas.add(preview);
    }
  }

  function onMouseMove(opt: any) {
    if (!drawing || !origin) {
      return;
    }

    const point = canvas.getScenePoint(opt.e);

    if (tool.value === 'arrow') {
      // A Path's geometry is baked in at construction, so redraw rather than resize.
      if (preview) {
        canvas.remove(preview);
      }

      preview = createArrow(origin, point);
      canvas.add(preview);
    } else {
      preview?.set(normalizeRect(origin, point));
    }

    canvas.requestRenderAll();
  }

  function onMouseUp(opt: any) {
    if (!drawing || !origin) {
      return;
    }

    const point = canvas.getScenePoint(opt.e);
    const tooSmall = isTinyDrag(origin, point, MIN_DRAG);
    const drawn = preview;

    drawing = false;
    origin = null;
    preview = null;

    if (tooSmall && drawn) {
      canvas.remove(drawn);
    }

    if (tool.value === 'crop') {
      cropMarquee = tooSmall ? null : drawn;
      canApplyCrop.value = !!cropMarquee;
    } else if (drawn && !tooSmall) {
      drawn.setCoords();
    }

    suppressHistory = false;

    if (drawn && !tooSmall && tool.value !== 'crop') {
      pushHistory();
    }

    canvas.requestRenderAll();
  }

  function bindEvents() {
    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);

    const record = () => pushHistory();

    canvas.on('object:added', record);
    canvas.on('object:modified', record);
    canvas.on('object:removed', record);

    canvas.on('text:editing:exited', (e: any) => {
      const target = e.target as IText;

      if (!target?.text?.trim()) {
        // An IText left empty is a stray click, not an annotation. Removing it must not
        // register as an undo step either.
        withoutHistory(() => canvas.remove(target));
        canvas.requestRenderAll();

        return;
      }

      // The object was added empty, with history suppressed. Its text is only real now,
      // so this is the moment worth being able to undo back to.
      pushHistory();
    });
  }

  /* --------------------------------------------------------------------- export */

  /**
   * Composites background and annotations into one canvas at the image's native
   * resolution. This — not the original capture — is what gets stored.
   */
  function exportCanvas(): HTMLCanvasElement {
    clearCropMarquee();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    return canvas.toCanvasElement(1 / canvas.getZoom(), { filter: (obj: any) => !obj[CROP_MARQUEE] } as any);
  }

  /* ------------------------------------------------------------------ lifecycle */

  onMounted(async() => {
    canvas = new Canvas(canvasEl.value!, {
      selection:              false,
      preserveObjectStacking: true,
      // Retina scaling would double the backing store for no gain; we export at the
      // image's own resolution regardless of how it is displayed.
      enableRetinaScaling:    false,
    });

    bindEvents();
    await loadImage(image.value);

    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(stageEl.value!);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    // Fabric attaches document-level listeners; disposing is not optional.
    canvas?.dispose();
  });

  watch(image, (next) => loadImage(next));
  watch(tool, (next) => applyTool(next));
  watch([color, strokeWidth], () => {
    applyTool(tool.value);
    restyleSelection();
  });

  return {
    tool,
    color,
    strokeWidth,
    canUndo,
    canRedo,
    canApplyCrop,
    loading,
    undo,
    redo,
    reset,
    applyCrop,
    cancelCrop,
    exportCanvas,
  };
}
