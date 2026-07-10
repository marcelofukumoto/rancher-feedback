<script setup lang="ts">
import { useI18n } from '@shell/composables/useI18n';
import { ref, watch } from 'vue';
import { useStore } from 'vuex';

import { useScreenshotEditor } from '../composables/useScreenshotEditor';
import type { CapturedImage } from '../types/feedback';
import EditorToolbar from './EditorToolbar.vue';

const props = defineProps<{
  /** Replacing this reloads the canvas and discards annotations. */
  image: CapturedImage;
  busy?: boolean;
}>();

const emit = defineEmits<{(e: 'recapture'): void }>();

const store = useStore();
const i18n = useI18n(store);

const canvasEl = ref<HTMLCanvasElement>();
const stageEl = ref<HTMLElement>();
const imageRef = ref(props.image);

const {
  tool, color, strokeWidth, canUndo, canRedo, canApplyCrop, loading,
  undo, redo, reset, applyCrop, cancelCrop, exportCanvas,
} = useScreenshotEditor({
  canvasEl, stageEl, image: imageRef
});

// Keep the composable's image ref in step with the prop, so a re-capture reloads.
watch(() => props.image, (next) => {
  imageRef.value = next;
});

// Exposed for FeedbackDialog, which flattens this on submit.
defineExpose({ exportCanvas });
</script>

<template>
  <div
    class="screenshot-editor"
    data-testid="feedback-screenshot-editor"
  >
    <EditorToolbar
      v-model:tool="tool"
      v-model:color="color"
      v-model:stroke-width="strokeWidth"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :can-apply-crop="canApplyCrop"
      :busy="props.busy || loading"
      @undo="undo"
      @redo="redo"
      @reset="reset"
      @apply-crop="applyCrop"
      @cancel-crop="cancelCrop"
      @recapture="emit('recapture')"
    />

    <div
      ref="stageEl"
      class="stage"
    >
      <canvas ref="canvasEl" />
    </div>

    <p class="hint">
      {{ i18n.t(`rancherFeedback.editor.hint.${ tool }`) }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.screenshot-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  // Bounds the canvas so fit() has a stable box to scale into.
  height: 58vh;
  min-height: 320px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--nav-bg);
  overflow: hidden;

  :deep(.canvas-container) {
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }
}

.hint {
  margin: 0;
  min-height: 18px;
  color: var(--muted);
  font-size: 12px;
}
</style>
