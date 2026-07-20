import { importTypes } from '@rancher/auto-import';
import { ActionLocation, ActionOpts, IPlugin } from '@shell/core/types';

import { captureScreen } from './services/capture';
import { pageContext } from './services/context';
import { FEEDBACK_DIALOG } from './types/constants';

export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Adds a "Feedback" nav entry listing the Feedback custom resources.
  plugin.addProduct(require('./product'));

  // The dialog itself is registered automatically: importTypes() above scans the
  // `dialog/` folder and registers FeedbackDialog.vue under the name `FeedbackDialog`
  // (see FEEDBACK_DIALOG). Rancher's own PromptModal resolves it by that name, so the
  // modal inherits the shell's styling, focus trap and escape handling.

  plugin.addAction(
    ActionLocation.HEADER,
    {},
    {
      // Rancher derives the header action's test id from labelKey/label; without one it
      // becomes `extension-header-action-undefined`.
      labelKey:   'rancherFeedback.header.label',
      tooltipKey: 'rancherFeedback.header.tooltip',
      tooltip:    'Send feedback about this screen',
      // ⌘⇧F / Ctrl+Shift+F — the object form avoids the plain ⌘F/Ctrl+F collision with
      // the browser's Find. Rancher's shell (plugin-helpers.ts) passes the object straight
      // through as the shortkey and renders the tooltip label as `(⌘-Shift-F)`.
      shortcut:   { windows: ['ctrl', 'shift', 'f'], mac: ['meta', 'shift', 'f'] },
      icon:       'icon-comment',

      /**
       * Invoked as `fn.apply(headerComponent, [opts, resources, { $route }])`, so `this`
       * carries `$store` and the route arrives as the third argument.
       * See shell/components/nav/Header.vue.
       */
      async invoke(this: any, opts: ActionOpts, _resources: any[], globals?: any): Promise<boolean> {
        // Capture silently first, while the modal is still closed — otherwise the modal
        // itself ends up in the screenshot. This path is html2canvas only: it never
        // prompts. If it fails, the dialog opens with no image and offers a manual
        // "Take screenshot" button, so the browser's screen-share prompt is only ever
        // triggered by an explicit click, never automatically.
        let screenshot = null;

        try {
          screenshot = await captureScreen();
        } catch (e: any) {
          // Pass a plain string, never the raw caught value — a failed dynamic import or
          // DOM operation can throw a non-cloneable object, and Rancher's notification
          // pipeline posts errors to a web worker (structured clone) where that throws.
          this.$store.dispatch('growl/error', {
            title:   'Could not capture this screen automatically',
            message: String(e?.message || e),
            timeout: 5000,
          }, { root: true });
        }

        this.$store.dispatch('management/promptModal', {
          component:      FEEDBACK_DIALOG,
          componentProps: {
            screenshot,
            context: pageContext(this.$store, globals?.$route, (opts as any)?.product),
          },
          modalWidth:          '1100px',
          closeOnClickOutside: false,
        });

        return true;
      },
    },
  );
}
