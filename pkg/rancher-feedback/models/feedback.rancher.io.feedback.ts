// @rancher/shell ships this model base as untyped JS; the default import resolves to any.
import SteveModel from '@shell/plugins/steve/steve-class';

import type { FeedbackPhase, FeedbackSpec, FeedbackStatus } from '../types/feedback';
import { base64SizeKb, toDataUrl } from '../utils/image';

/** Maps our phases onto states the shell already knows how to colour. */
const PHASE_TO_STATE: Record<FeedbackPhase, string> = {
  Pending:    'pending',
  Processing: 'in-progress',
  Done:       'success',
  Failed:     'error',
};

export default class Feedback extends SteveModel {
  declare spec: FeedbackSpec;
  declare status?: FeedbackStatus;
  declare metadata: { name: string };

  get phase(): FeedbackPhase {
    return this.status?.phase || 'Pending';
  }

  get state(): string {
    return PHASE_TO_STATE[this.phase] || 'pending';
  }

  get stateDisplay(): string {
    return this.phase;
  }

  /** The list reads far better keyed on what the person asked for than on `fb-2026…`. */
  get nameDisplay(): string {
    const message = this.spec?.message?.trim();

    if (!message) {
      return this.metadata?.name;
    }

    const firstLine = message.split('\n')[0];

    return firstLine.length > 80 ? `${ firstLine.slice(0, 77) }…` : firstLine;
  }

  get screenshotDataUrl(): string | null {
    const shot = this.spec?.screenshot;

    return shot?.data ? toDataUrl({ contentType: shot.contentType || 'image/jpeg', data: shot.data }) : null;
  }

  get screenshotSizeKb(): number {
    return base64SizeKb(this.spec?.screenshot?.data || '');
  }

  get prUrl(): string | null {
    return this.status?.prUrl || null;
  }

  /** Creating or editing a Feedback by hand is not a flow we support; the dialog owns it. */
  get canCustomEdit(): boolean {
    return false;
  }

  get canCreate(): boolean {
    return false;
  }
}
