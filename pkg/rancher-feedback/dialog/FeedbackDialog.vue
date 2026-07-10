<script setup lang="ts">
import { Banner } from '@components/Banner';
import { LabeledInput } from '@components/Form/LabeledInput';
import AsyncButton from '@shell/components/AsyncButton.vue';
import { useI18n } from '@shell/composables/useI18n';
import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { useStore } from 'vuex';

import ScreenshotEditor from '../components/ScreenshotEditor.vue';
import { captureDisplayMedia, compressToBudget, ScreenshotTooLargeError } from '../services/capture';
import { currentUser } from '../services/context';
import {
  createFeedback, ensurePrereqs, installPrereqs, updatePrereqs,
} from '../services/feedback';
import { NAMESPACE, SCREENSHOT_BUDGET_BYTES } from '../types/constants';
import type { CapturedImage, PageContext, Prereqs } from '../types/feedback';

const props = defineProps<{
  /**
   * The silent capture taken by the header action before this dialog opened. Null when
   * html2canvas failed — the dialog then offers a manual "Take screenshot" button rather
   * than raising the screen-share prompt on its own.
   */
  screenshot: CapturedImage | null;
  context: PageContext;
}>();

const emit = defineEmits<{(e: 'close'): void }>();

const store = useStore();
const i18n = useI18n(store);

const editor = useTemplateRef<InstanceType<typeof ScreenshotEditor>>('editor');

const image = ref<CapturedImage | null>(props.screenshot);
const message = ref('');
const branch = ref('');

const prereqs = ref<Prereqs | null>(null);
const installing = ref(false);
const recapturing = ref(false);
const errors = ref<string[]>([]);

const budgetKb = Math.round(SCREENSHOT_BUDGET_BYTES / 1024);

const busy = computed(() => installing.value || recapturing.value);
const missingPrereqs = computed(() => !!prereqs.value && (!prereqs.value.crd || !prereqs.value.namespace));
const outdatedPrereqs = computed(() => !!prereqs.value && prereqs.value.crd && prereqs.value.needsUpdate);
/** An empty note, or no screenshot at all, gives the downstream agent nothing to act on. */
const canSubmit = computed(() => !!image.value && !!message.value.trim() && !missingPrereqs.value && !busy.value);

onMounted(async() => {
  prereqs.value = await ensurePrereqs(store);
});

function close() {
  emit('close');
}

function describeError(e: any): string {
  if (e instanceof ScreenshotTooLargeError) {
    return i18n.t('rancherFeedback.errors.tooLarge', { actual: Math.round(e.actualBytes / 1024), budget: budgetKb });
  }

  // Steve surfaces API errors as { _statusCode, message } or an array of them.
  if (Array.isArray(e)) {
    return e.map((item) => item?.message || String(item)).join('; ');
  }

  if (e?._statusCode === 403) {
    return i18n.t('rancherFeedback.errors.forbidden');
  }

  return e?.message || String(e);
}

/**
 * Takes a pixel-perfect screenshot via the browser's native capture. This is the only
 * place the "Share this tab" prompt is raised, and always from an explicit click — the
 * empty-state "Take screenshot" button, or the editor's re-capture button. Re-capturing
 * over existing annotations discards them, so we confirm in that case only.
 */
async function recapture() {
  if (image.value && !window.confirm(i18n.t('rancherFeedback.dialog.recaptureConfirm'))) {
    return;
  }

  recapturing.value = true;
  errors.value = [];

  try {
    image.value = await captureDisplayMedia();
  } catch (e: any) {
    // A user dismissing the browser's picker is a cancellation, not a failure.
    if (e?.name !== 'NotAllowedError') {
      errors.value = [e?.message || String(e)];
    }
  } finally {
    recapturing.value = false;
  }
}

async function install(done: (ok: boolean) => void) {
  installing.value = true;
  errors.value = [];

  try {
    await installPrereqs(store, prereqs.value!);
    prereqs.value = await ensurePrereqs(store);
    done(true);
  } catch (e: any) {
    errors.value = [describeError(e)];
    done(false);
  } finally {
    installing.value = false;
  }
}

async function update(done: (ok: boolean) => void) {
  installing.value = true;
  errors.value = [];

  try {
    await updatePrereqs(store);
    prereqs.value = await ensurePrereqs(store);
    done(true);
  } catch (e: any) {
    errors.value = [describeError(e)];
    done(false);
  } finally {
    installing.value = false;
  }
}

async function submit(done: (ok: boolean) => void) {
  errors.value = [];

  try {
    // The flattened editor canvas, not the original capture: what the user drew is what
    // gets stored.
    const flattened = editor.value!.exportCanvas();
    const shot = compressToBudget(flattened);

    await createFeedback(store, {
      message:     message.value,
      screenshot:  shot,
      page:        props.context,
      submittedBy: currentUser(store),
      branch:      branch.value.trim() || undefined,
    });

    done(true);
    close();
  } catch (e: any) {
    errors.value = [describeError(e)];
    done(false);
  }
}
</script>

<template>
  <div
    class="feedback-dialog"
    data-testid="feedback-dialog"
  >
    <div class="header">
      <h3>{{ i18n.t('rancherFeedback.dialog.title') }}</h3>
      <button
        type="button"
        class="close-btn"
        :aria-label="i18n.t('generic.close')"
        data-testid="feedback-dialog-close"
        @click="close"
      >
        <i class="icon icon-close" />
      </button>
    </div>

    <Banner
      v-if="missingPrereqs && prereqs && prereqs.canInstall"
      color="warning"
      class="prereq-banner"
    >
      <div class="prereq">
        <span>{{ i18n.t('rancherFeedback.prereqs.installable', { namespace: NAMESPACE }) }}</span>
        <AsyncButton
          mode="feedbackInstall"
          size="sm"
          :disabled="busy"
          data-testid="feedback-install-prereqs"
          @click="install"
        />
      </div>
    </Banner>

    <Banner
      v-else-if="missingPrereqs"
      color="error"
      :label="i18n.t('rancherFeedback.prereqs.askAdmin', { namespace: NAMESPACE })"
    />

    <Banner
      v-else-if="outdatedPrereqs && prereqs && prereqs.canUpdate"
      color="info"
      class="prereq-banner"
    >
      <div class="prereq">
        <span>{{ i18n.t('rancherFeedback.prereqs.updatable') }}</span>
        <AsyncButton
          mode="feedbackUpdate"
          size="sm"
          :disabled="busy"
          data-testid="feedback-update-prereqs"
          @click="update"
        />
      </div>
    </Banner>

    <div class="panes">
      <ScreenshotEditor
        v-if="image"
        ref="editor"
        :image="image"
        :busy="busy"
        @recapture="recapture"
      />

      <div
        v-else
        class="empty-capture"
        data-testid="feedback-empty-capture"
      >
        <p>{{ i18n.t('rancherFeedback.dialog.captureFailed') }}</p>
        <button
          type="button"
          class="btn role-primary"
          :disabled="recapturing"
          data-testid="feedback-take-screenshot"
          @click="recapture"
        >
          {{ i18n.t('rancherFeedback.dialog.takeScreenshot') }}
        </button>
      </div>

      <div class="form">
        <LabeledInput
          v-model:value="message"
          type="multiline"
          :label="i18n.t('rancherFeedback.dialog.message')"
          :placeholder="i18n.t('rancherFeedback.dialog.messagePlaceholder')"
          :min-height="180"
          required
          :disabled="busy"
          data-testid="feedback-message"
        />

        <LabeledInput
          v-model:value="branch"
          :label="i18n.t('rancherFeedback.dialog.branch')"
          :placeholder="i18n.t('rancherFeedback.dialog.branchPlaceholder')"
          :tooltip="i18n.t('rancherFeedback.dialog.branchTooltip')"
          :disabled="busy"
          data-testid="feedback-branch"
        />

        <dl class="context">
          <dt>{{ i18n.t('rancherFeedback.dialog.context.product') }}</dt>
          <dd>{{ context.product || '—' }}</dd>

          <dt>{{ i18n.t('rancherFeedback.dialog.context.cluster') }}</dt>
          <dd>{{ context.clusterId || '—' }}</dd>

          <dt>{{ i18n.t('rancherFeedback.dialog.context.route') }}</dt>
          <dd class="mono">
            {{ context.route || '—' }}
          </dd>
        </dl>
      </div>
    </div>

    <Banner
      v-for="(error, i) in errors"
      :key="i"
      color="error"
      :label="error"
    />

    <div class="footer">
      <button
        type="button"
        class="btn role-secondary"
        :disabled="busy"
        data-testid="feedback-cancel"
        @click="close"
      >
        {{ i18n.t('generic.cancel') }}
      </button>

      <AsyncButton
        mode="feedbackSubmit"
        :disabled="!canSubmit"
        data-testid="feedback-submit"
        @click="submit"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.feedback-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
  }
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--body-text);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.prereq {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}

.empty-capture {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 58vh;
  border: 1px dashed var(--border);
  border-radius: var(--border-radius);
  background: var(--body-bg);
  color: var(--muted);
  text-align: center;
  padding: 24px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid var(--border);
  font-size: 12px;

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
}

.mono {
  font-family: monospace;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

// The editor needs the width; stack rather than squeeze it.
@media (max-width: 1000px) {
  .panes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
