/**
 * Everything you need to change to re-home this extension onto a different API group
 * lives in this file.
 */

export const EXTENSION_NAME = 'rancher-feedback';

export const GROUP = 'feedback.rancher.io';
export const VERSION = 'v1alpha1';
export const KIND = 'Feedback';
export const PLURAL = 'feedbacks';

/** Steve names a custom resource `<group>.<lowercased kind>`. */
export const FEEDBACK_TYPE = `${ GROUP }.${ KIND.toLowerCase() }`;
export const CRD_TYPE = 'apiextensions.k8s.io.customresourcedefinition';
export const CRD_NAME = `${ PLURAL }.${ GROUP }`;
export const NAMESPACE_TYPE = 'namespace';

/**
 * Feedback always lands in the local cluster, whichever cluster the user is browsing.
 * The `management` Steve store is `/v1` on the Rancher server, which is the local
 * cluster, and it is loaded on every page — including global ones like Extensions,
 * where the `cluster` store is not.
 */
export const MANAGEMENT_STORE = 'management';
export const NAMESPACE = 'rancher-feedback';

export const LABELS = {
  cluster:   `${ GROUP }/cluster`,
  product:   `${ GROUP }/product`,
  submitter: `${ GROUP }/submitted-by`,
};

/** Name of the dialog registered with `plugin.register('dialog', ...)`. */
export const FEEDBACK_DIALOG = 'FeedbackDialog';

/**
 * etcd rejects objects over roughly 1.5MiB, and the screenshot rides inline in the CR.
 * We aim well under that so the rest of the object — and Steve's own envelope — has room.
 * Expressed in base64 characters, which is what actually goes over the wire.
 */
export const SCREENSHOT_BUDGET_BYTES = 900 * 1024;

/** Downscale anything wider than this before encoding. Retina captures are 2x. */
export const SCREENSHOT_MAX_WIDTH = 1920;

/** JPEG quality ladder, walked from best to worst until we fit the budget. */
export const SCREENSHOT_QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

export const SCREENSHOT_CONTENT_TYPE = 'image/jpeg';

/** Undo/redo history depth in the editor. Snapshots are full canvas serialisations. */
export const HISTORY_LIMIT = 25;
