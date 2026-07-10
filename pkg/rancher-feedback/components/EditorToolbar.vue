<script setup lang="ts">
import { useI18n } from '@shell/composables/useI18n';
import { useStore } from 'vuex';

import type { Tool } from '../composables/useScreenshotEditor';

/**
 * Rancher's icon font ships 143 glyphs and has none of undo, redo, crop or arrow, so the
 * tools are inline SVG. They inherit `currentColor`, which keeps them correct in both
 * themes without a second set of assets.
 */
const TOOL_ICONS: Record<Tool, string> = {
  select: 'M4 2l14 9-6 1.2 3.3 6.1-2.4 1.3-3.3-6.1L4 18z',
  pen:    'M3 17.3V21h3.7L17.6 10.1l-3.7-3.7L3 17.3zM20.7 7a1 1 0 000-1.4l-2.3-2.3a1 1 0 00-1.4 0l-1.8 1.8 3.7 3.7L20.7 7z',
  arrow:  'M4 20L20 4M20 4h-8M20 4v8',
  rect:   'M4 5h16v14H4z',
  text:   'M5 5h14M12 5v14M9 19h6',
  redact: 'M3 8h18v8H3z',
  crop:   'M7 2v15h15M2 7h15v15',
};

/** Filled icons read better than stroked ones at 18px for these two. */
const FILLED_TOOLS: Tool[] = ['select', 'pen'];

const SWATCHES = ['#e02020', '#f7b500', '#00b42a', '#1890ff', '#722ed1', '#000000', '#ffffff'];
const STROKE_WIDTHS = [2, 4, 8, 14];

const TOOLS = Object.keys(TOOL_ICONS) as Tool[];

const props = defineProps<{
  canUndo: boolean;
  canRedo: boolean;
  /** True once a crop marquee exists and can be applied. */
  canApplyCrop: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'reset'): void;
  (e: 'apply-crop'): void;
  (e: 'cancel-crop'): void;
  (e: 'recapture'): void;
}>();

const tool = defineModel<Tool>('tool', { required: true });
const color = defineModel<string>('color', { required: true });
const strokeWidth = defineModel<number>('strokeWidth', { required: true });

const store = useStore();
const i18n = useI18n(store);

const isFilled = (candidate: Tool): boolean => FILLED_TOOLS.includes(candidate);
const toolLabel = (candidate: Tool): string => i18n.t(`rancherFeedback.editor.tool.${ candidate }`);
</script>

<template>
  <div
    class="editor-toolbar"
    data-testid="feedback-editor-toolbar"
  >
    <div
      class="group"
      role="radiogroup"
      :aria-label="i18n.t('rancherFeedback.editor.toolsLabel')"
    >
      <button
        v-for="item in TOOLS"
        :key="item"
        type="button"
        role="radio"
        class="tool-btn"
        :class="{ active: tool === item }"
        :aria-checked="tool === item"
        :title="toolLabel(item)"
        :aria-label="toolLabel(item)"
        :disabled="props.busy"
        :data-testid="`feedback-editor-tool-${ item }`"
        @click="tool = item"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            :d="TOOL_ICONS[item]"
            :fill="isFilled(item) ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div class="group">
      <button
        v-for="swatch in SWATCHES"
        :key="swatch"
        type="button"
        class="swatch"
        :class="{ active: color === swatch }"
        :style="{ backgroundColor: swatch }"
        :title="swatch"
        :aria-label="swatch"
        :disabled="props.busy"
        :data-testid="`feedback-editor-swatch-${ swatch.replace('#', '') }`"
        @click="color = swatch"
      />
    </div>

    <div class="group">
      <button
        v-for="width in STROKE_WIDTHS"
        :key="width"
        type="button"
        class="stroke-btn"
        :class="{ active: strokeWidth === width }"
        :title="i18n.t('rancherFeedback.editor.strokeWidth', { width })"
        :aria-label="i18n.t('rancherFeedback.editor.strokeWidth', { width })"
        :disabled="props.busy"
        :data-testid="`feedback-editor-stroke-${ width }`"
        @click="strokeWidth = width"
      >
        <span
          class="stroke-dot"
          :style="{ width: `${ width + 2 }px`, height: `${ width + 2 }px` }"
        />
      </button>
    </div>

    <div class="group">
      <button
        type="button"
        class="tool-btn"
        :disabled="!props.canUndo || props.busy"
        :title="i18n.t('rancherFeedback.editor.undo')"
        :aria-label="i18n.t('rancherFeedback.editor.undo')"
        data-testid="feedback-editor-undo"
        @click="emit('undo')"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M9 7H15a5 5 0 010 10h-4M9 7l4-4M9 7l4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="!props.canRedo || props.busy"
        :title="i18n.t('rancherFeedback.editor.redo')"
        :aria-label="i18n.t('rancherFeedback.editor.redo')"
        data-testid="feedback-editor-redo"
        @click="emit('redo')"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M15 7H9a5 5 0 000 10h4M15 7l-4-4M15 7l-4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="!props.canUndo || props.busy"
        :title="i18n.t('rancherFeedback.editor.reset')"
        :aria-label="i18n.t('rancherFeedback.editor.reset')"
        data-testid="feedback-editor-reset"
        @click="emit('reset')"
      >
        <i class="icon icon-trash" />
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="props.busy"
        :title="i18n.t('rancherFeedback.editor.recapture')"
        :aria-label="i18n.t('rancherFeedback.editor.recapture')"
        data-testid="feedback-editor-recapture"
        @click="emit('recapture')"
      >
        <i class="icon icon-refresh" />
      </button>
    </div>

    <div
      v-if="tool === 'crop'"
      class="group crop-actions"
    >
      <button
        type="button"
        class="btn btn-sm role-primary"
        :disabled="!props.canApplyCrop || props.busy"
        data-testid="feedback-editor-apply-crop"
        @click="emit('apply-crop')"
      >
        {{ i18n.t('rancherFeedback.editor.applyCrop') }}
      </button>
      <button
        type="button"
        class="btn btn-sm role-secondary"
        :disabled="props.busy"
        data-testid="feedback-editor-cancel-crop"
        @click="emit('cancel-crop')"
      >
        {{ i18n.t('generic.cancel') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--body-bg);
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;

  & + .group {
    border-left: 1px solid var(--border);
    padding-left: 16px;
  }
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: transparent;
  color: var(--body-text);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--accent-btn);
  }

  &.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--primary-text);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--outline);
    outline-offset: 1px;
  }
}

.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--border);
  cursor: pointer;

  &.active {
    border-color: var(--primary);
    transform: scale(1.15);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.stroke-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--accent-btn);
  }

  &.active {
    border-color: var(--primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.stroke-dot {
  display: block;
  border-radius: 50%;
  background: var(--body-text);
}

.crop-actions {
  margin-left: auto;
}
</style>
