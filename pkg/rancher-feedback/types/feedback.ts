/**
 * Mirrors `deploy/crd.yaml`. Keep the two in step.
 */

export type FeedbackPhase = 'Pending' | 'Processing' | 'Done' | 'Failed';

export interface Viewport {
  width: number;
  height: number;
}

export interface PageContext {
  url: string;
  route: string;
  product: string;
  clusterId: string;
  resourceType?: string;
  viewport: Viewport;
}

export interface FeedbackTarget {
  branch?: string;
  repo?: string;
}

/** A flattened, annotated image, ready to be written into the CR. */
export interface Screenshot {
  contentType: string;
  encoding: 'base64';
  width: number;
  height: number;
  /** Base64 with no `data:` prefix — the CRD stores raw base64. */
  data: string;
}

export interface FeedbackSpec {
  message: string;
  submittedBy?: string;
  submittedAt?: string;
  page?: PageContext;
  target?: FeedbackTarget;
  screenshot: Screenshot;
}

export interface FeedbackStatus {
  phase?: FeedbackPhase;
  message?: string;
  branch?: string;
  commit?: string;
  prUrl?: string;
  /** Deployed preview URL where the applied change can be viewed; filled by the agent. */
  previewUrl?: string;
  observedGeneration?: number;
  conditions?: {
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastUpdateTime?: string;
    lastTransitionTime?: string;
  }[];
}

export interface Feedback {
  apiVersion?: string;
  kind?: string;
  type?: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
  };
  spec: FeedbackSpec;
  status?: FeedbackStatus;
}

/**
 * An image held in the browser between capture and submit. `dataUrl` is what the
 * editor renders; `toScreenshot()` in services/capture.ts turns the edited result
 * into the `Screenshot` above.
 */
export interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** What `ensurePrereqs()` found in the cluster. */
export interface Prereqs {
  crd: boolean;
  namespace: boolean;
  /** False when the user lacks the RBAC to create what's missing. */
  canInstall: boolean;
  /** The installed CRD is older than the one this extension ships. */
  needsUpdate: boolean;
  /** The user is allowed to update the existing CRD (admin). */
  canUpdate: boolean;
}
