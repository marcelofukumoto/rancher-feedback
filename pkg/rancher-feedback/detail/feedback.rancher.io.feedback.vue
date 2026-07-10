<script setup lang="ts">
import { Banner } from '@components/Banner';
import { useI18n } from '@shell/composables/useI18n';
import { computed } from 'vue';
import { useStore } from 'vuex';

import type Feedback from '../models/feedback.rancher.io.feedback';

/**
 * Read-only view of a submitted feedback.
 *
 * The `agent` section is where the downstream pipeline's live progress window will mount.
 * Until then it renders whatever the agent has written to `status`, which is enough to
 * follow a run from the UI.
 */
const props = defineProps<{ value: Feedback }>();

const store = useStore();
const i18n = useI18n(store);

const page = computed(() => props.value.spec?.page || ({} as NonNullable<Feedback['spec']['page']>));
const target = computed(() => props.value.spec?.target || {});
const status = computed(() => props.value.status || {});

const hasAgentActivity = computed(() => {
  const s = status.value;

  return !!(s.message || s.branch || s.commit || s.prUrl || s.previewUrl);
});
</script>

<template>
  <div
    class="feedback-detail"
    data-testid="feedback-detail"
  >
    <div class="section">
      <h3>{{ i18n.t('rancherFeedback.detail.request') }}</h3>
      <p class="message">
        {{ value.spec.message }}
      </p>
    </div>

    <div class="section">
      <h3>{{ i18n.t('rancherFeedback.detail.screenshot') }}</h3>
      <img
        v-if="value.screenshotDataUrl"
        :src="value.screenshotDataUrl"
        :alt="i18n.t('rancherFeedback.detail.screenshotAlt')"
        class="screenshot"
        data-testid="feedback-detail-screenshot"
      >
      <Banner
        v-else
        color="warning"
        :label="i18n.t('rancherFeedback.detail.noScreenshot')"
      />
      <p
        v-if="value.screenshotDataUrl"
        class="meta"
      >
        {{ value.spec.screenshot.width }}&times;{{ value.spec.screenshot.height }} &middot;
        {{ value.screenshotSizeKb }} KB &middot; {{ value.spec.screenshot.contentType }}
      </p>
    </div>

    <div class="section">
      <h3>{{ i18n.t('rancherFeedback.detail.context') }}</h3>
      <dl class="context">
        <dt>{{ i18n.t('rancherFeedback.dialog.context.product') }}</dt>
        <dd>{{ page.product || '—' }}</dd>

        <dt>{{ i18n.t('rancherFeedback.dialog.context.cluster') }}</dt>
        <dd>{{ page.clusterId || '—' }}</dd>

        <dt>{{ i18n.t('rancherFeedback.dialog.context.route') }}</dt>
        <dd class="mono">
          {{ page.route || '—' }}
        </dd>

        <dt>{{ i18n.t('rancherFeedback.detail.url') }}</dt>
        <dd class="mono break">
          {{ page.url || '—' }}
        </dd>

        <dt>{{ i18n.t('rancherFeedback.dialog.branch') }}</dt>
        <dd>{{ target.branch || '—' }}</dd>

        <dt>{{ i18n.t('rancherFeedback.detail.submittedBy') }}</dt>
        <dd>{{ value.spec.submittedBy || '—' }}</dd>
      </dl>
    </div>

    <div class="section">
      <h3>{{ i18n.t('rancherFeedback.detail.agent') }}</h3>

      <Banner
        v-if="!hasAgentActivity"
        color="info"
        :label="i18n.t('rancherFeedback.detail.awaitingAgent')"
      />

      <dl
        v-else
        class="context"
      >
        <dt>{{ i18n.t('rancherFeedback.detail.phase') }}</dt>
        <dd>{{ status.phase || 'Pending' }}</dd>

        <template v-if="status.message">
          <dt>{{ i18n.t('rancherFeedback.detail.agentMessage') }}</dt>
          <dd>{{ status.message }}</dd>
        </template>

        <template v-if="status.branch">
          <dt>{{ i18n.t('rancherFeedback.dialog.branch') }}</dt>
          <dd class="mono">
            {{ status.branch }}
          </dd>
        </template>

        <template v-if="status.commit">
          <dt>{{ i18n.t('rancherFeedback.detail.commit') }}</dt>
          <dd class="mono">
            {{ status.commit }}
          </dd>
        </template>

        <template v-if="status.prUrl">
          <dt>{{ i18n.t('rancherFeedback.detail.pullRequest') }}</dt>
          <dd>
            <a
              :href="status.prUrl"
              target="_blank"
              rel="noopener noreferrer"
            >{{ status.prUrl }}</a>
          </dd>
        </template>

        <template v-if="status.previewUrl">
          <dt>{{ i18n.t('rancherFeedback.detail.preview') }}</dt>
          <dd>
            <a
              :href="status.previewUrl"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="feedback-preview-url"
            >{{ status.previewUrl }}</a>
          </dd>
        </template>
      </dl>

      <a
        v-if="status.previewUrl"
        :href="status.previewUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn role-primary open-preview"
        data-testid="feedback-open-preview"
      >
        {{ i18n.t('rancherFeedback.detail.openPreview') }}
      </a>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.feedback-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 20px;
}

.section h3 {
  margin-bottom: 8px;
}

.message {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--body-bg);
  white-space: pre-wrap;
}

.screenshot {
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
}

.meta {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
  }
}

.mono {
  font-family: monospace;
}

.break {
  overflow-wrap: anywhere;
}

.open-preview {
  align-self: start;
  margin-top: 12px;
  text-decoration: none;
}
</style>
