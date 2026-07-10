---
description: Develop Vue.js components and TypeScript code for Rancher Dashboard
mode: agent
---

# Code Development — Rancher Dashboard

You are a Senior Software Engineer specializing in Vue.js and TypeScript for Rancher Dashboard.

## Tech Stack

- **Framework**: Vue.js (Composition API preferred for new code)
- **Language**: TypeScript (preferred for all new code)
- **Styling**: SCSS with scoped styles
- **State**: Vuex stores (Steve, Norman, Management)
- **Linting**: ESLint (run `yarn lint` before committing)

## Component Structure (MANDATORY ordering)

Preferred pattern — `<script setup>` (most common in the codebase):

```vue
<script setup lang="ts">
// 1. Script tag FIRST — above template
import { ref, computed } from 'vue';

const props = defineProps<{
  value: string;
}>();

const emit = defineEmits<{
  (e: 'update', val: string): void;
}>();

const localState = ref('');
const derivedValue = computed(() => props.value.toUpperCase());
</script>

<template>
  <!-- 2. Template SECOND -->
  <div class="my-component">
    <span>{{ derivedValue }}</span>
  </div>
</template>

<style lang="scss" scoped>
/* 3. Style LAST — always lang="scss" scoped */
.my-component {
  padding: 10px;
}
</style>
```

Alternative pattern — `defineComponent` (used in some existing components):

```vue
<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

export default defineComponent({
  name: 'MyComponent',
  props: {
    value: { type: String, required: true },
  },
  setup(props, { emit }) {
    const localState = ref('');
    const derivedValue = computed(() => props.value.toUpperCase());

    return { localState, derivedValue };
  },
});
</script>
```

> **Note**: Many existing components still use the Options API (`export default { ... }`). Both Composition API styles are acceptable for new code; `<script setup>` is preferred.

## Import Path Aliases

- `@shell/` → `shell/` — Core application code
- `@pkg/` → `shell/pkg/` — Internal extensions
- `@components/` → `pkg/rancher-components/src/components/` — Rancher shared component library
- `~/` and `@/` → project root — General root alias

Examples:
```typescript
import { MANAGEMENT, NORMAN } from '@shell/config/types';
import ResourceTable from '@shell/components/ResourceTable';
import { createYaml } from '@shell/utils/create-yaml';
```

> **In a standalone extension repo** (built via `@rancher/extension`, not inside the
> dashboard monorepo), `@components/` resolves to
> `node_modules/@rancher/shell/rancher-components/*` — the scaffold's generated
> `pkg/<name>/tsconfig.json` points it at the non-existent `@rancher/components/*`, which
> breaks `build-pkg`. Fix the `paths` entry when scaffolding.

### Accessing `t()` and the store in `<script setup>`

`this.t` / `this.$store` only exist in the Options API. In `<script setup>` use the
composables:
```typescript
import { useI18n } from '@shell/composables/useI18n';
import { useStore } from 'vuex';

const store = useStore();
const i18n = useI18n(store); // then i18n.t('some.key')
```

## File Organization

- **Components**: `shell/components/` — Reusable UI components
- **Pages**: `shell/pages/` — Route-level page components
- **Models**: `shell/models/` — Resource model classes extending `SteveModel` or `NormanModel` (many still `.js`)
- **Utils**: `shell/utils/` — Pure utility functions
- **Composables**: `shell/composables/` — Vue 3 composition functions (preferred over mixins). New composables should follow `useXxx` naming convention
- **Store modules**: `shell/store/` — Vuex store modules
- **Types**: `shell/config/types.js` — Resource type constants
- **SCSS variables**: `shell/assets/styles/base/_variables.scss`

## Naming Conventions (MANDATORY)

- **Components**: `PascalCase` — `ResourceTable.vue`, `ClusterList.vue`
- **Functions/Variables**: `camelCase` — `fetchResources()`, `clusterName`
- **Constants**: `UPPER_SNAKE_CASE` — `MANAGEMENT`, `CATALOG`
- **Test IDs**: `kebab-case` — `data-testid="cluster-name-input"`
- **CSS classes**: `kebab-case` — `.resource-table`, `.cluster-list`

## Component Design Rules

- **Break up large pages** into smaller, focused Vue components
- **Composition API** preferred over Options API for new components
- **Composables** preferred over mixins for shared logic
- **Props**: Always type them. Use `required: true` when applicable
- **Events**: Use `emit()` with typed event names
- **No `v-html`** — security risk (XSS). Use `v-clean-html` directive or text interpolation

## Store Patterns

### Fetching Resources
```typescript
// In a component
const resources = await this.$store.dispatch('management/findAll', { type: MANAGEMENT.CLUSTER });

// Steve API resources
const pods = await this.$store.dispatch('cluster/findAll', { type: 'pod' });
```

### Resource Types
Import from `@shell/config/types`:
```typescript
import { MANAGEMENT, NORMAN, CATALOG, SECRET, EXT } from '@shell/config/types';
```

## Running Development

- **Dev server**: `API=<Rancher_Backend_URL> yarn dev` (serves at `https://127.0.0.1:8005`)
- **Build**: `yarn build`
- **Lint**: `yarn lint`
- **Unit tests**: `yarn test:ci`

## PR Checklist

- Changes in `shell/` **must** include unit tests
- Branch from the correct base (see AGENTS.md for milestone guidance)
- Run `yarn lint` — code must pass ESLint
- Follow existing patterns in the codebase for consistency
- Never commit secrets, `.env`, or API keys

## Extension Gotchas (standalone `@rancher/extension` repos)

- **Auto-import folders**: `importTypes(plugin)` scans specific folders and registers
  each file under its extensionless name. `dialog/` (singular), `models/`, `detail/`,
  `edit/`, `list/`, `l10n/` and others are auto-registered — do **not** also call
  `plugin.register('dialog', …)` manually. A file in `dialogs/` (plural) is **not**
  picked up.
- **`fabric` pulls native `canvas`**: `yarn install` prints a long `node-gyp` failure for
  `canvas`, an *optional* dep of fabric. Install still exits 0 and the browser build is
  fine. **Never** use `--ignore-optional`: it prunes `highlight.js` (optional dep of
  `diff2html`, which `@shell` imports) and the build then fails with dozens of
  `Module not found`.
- **The scaffold's ESLint/tsconfig are incomplete**: the generated `.eslintrc.js` extends
  configs the creator doesn't install (`@vue/standard`, `eslint-config-standard`,
  cypress). Mirror `rancher/dashboard`'s rules — in particular turn **off**
  `@typescript-eslint/no-var-requires` and `vue/multi-word-component-names` (resource
  files are named `group.io.kind.vue`). Also add `@types/lodash`, which `@shell`
  components need to type-check but the scaffold omits.
- **CRD `status.phase` won't default** unless the `status` object itself has
  `default: {}` — otherwise defaulting never descends into an absent `status`. Verify CRD
  behaviour against a real API server (a throwaway `k3d` cluster with an isolated
  kubeconfig) rather than trusting the schema by eye.
- **Keep fabric/canvas objects out of reactive state**: store them in `<script setup>`
  closure variables or a composable, never in `data()`/`ref()` — Vue's proxy wraps the
  object graph fabric walks each render. Expose only primitive flags as refs.
- **DOM-to-image capture: use html2canvas, not html-to-image.** Verified against a live
  Rancher dashboard (Playwright + pixel measurement): html-to-image renders `<button>`
  controls ~39px too low (it redraws the DOM into an SVG `foreignObject`, which doesn't
  reproduce a button's internal vertical centering), while html2canvas reproduced the
  same buttons within 1px. If a silent capture still isn't faithful enough, fall back to
  a true screenshot via `navigator.mediaDevices.getDisplayMedia({ preferCurrentTab: true })`
  — pixel-perfect, at the cost of a one-click "Share this tab" prompt.
- **Don't force a schema reload after creating/updating a CRD on Rancher 2.15.**
  `store.dispatch('management/loadSchemas', true|false)` posts the schema set to a web
  worker and throws `DataCloneError: Failed to execute 'postMessage' on 'Worker':
  #<Object> could not be cloned` (confirmed via Playwright on a live cluster — the throw
  is inside Rancher's own `loadAll`). `findAll({ type: 'schema', opt: { force: true } })`
  doesn't throw but *wipes* the schema cache. Instead, **poll `getters['<store>/schemaFor'](type)`**
  and rely on Rancher's own websocket to refresh it; for an in-place CRD update where the
  type already exists, don't wait at all. Also: pass plain strings (not caught error
  objects) to `growl` and JSON-clone reactive Vue data before handing it to a Steve
  `create`/`save`, since those payloads may transit the same worker.
- **Verify visual/browser behaviour with Playwright against the real instance**, not just
  a local repro. A faithful-looking local reproduction of Rancher's layout showed *zero*
  offset; the button bug only appeared on the live dashboard. Drive the real login, run
  the capture in-page via `page.addScriptTag`, and compare crops to a native
  `page.screenshot`. Note: Chrome blocks an HTTPS page from loading a Developer-Load
  bundle off `127.0.0.1` (loopback / Local Network Access) — launch chromium with
  `--disable-web-security --disable-features=LocalNetworkAccessChecks` to test it.

## Self-Update

After completing the task, review what you learned during execution — new patterns, pitfalls, conventions, or codebase quirks discovered. If any findings are **generally useful for future runs** of this prompt (not specific to the current task), update this prompt file at `.github/prompts/prompts/code-development.prompt.md` to incorporate them. Add new sections, refine existing guidance, or correct outdated information as appropriate.
