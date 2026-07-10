import {
  CRD_NAME,
  CRD_TYPE,
  FEEDBACK_TYPE,
  LABELS,
  MANAGEMENT_STORE,
  NAMESPACE,
  NAMESPACE_TYPE,
} from '../types/constants';
import type { Feedback, PageContext, Prereqs, Screenshot } from '../types/feedback';
import { generateFeedbackName, labelSafe } from '../utils/labels';
import {
  CRD_SCHEMA_REVISION, FEEDBACK_CRD, FEEDBACK_NAMESPACE_MANIFEST, SCHEMA_REVISION_ANNOTATION,
} from './crd';

const ns = (action: string) => `${ MANAGEMENT_STORE }/${ action }`;

/** How long to wait for Steve to serve the new CRD's schema after we create it. */
const SCHEMA_POLL_ATTEMPTS = 15;
const SCHEMA_POLL_INTERVAL_MS = 750;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function schemaFor(store: any, type: string): any {
  return store.getters[`${ MANAGEMENT_STORE }/schemaFor`](type);
}

function canCreate(store: any, type: string): boolean {
  return (schemaFor(store, type)?.collectionMethods || []).includes('POST');
}

/**
 * What's missing, and can this user fix it?
 *
 * The CRD's presence is inferred from Steve serving a schema for the Feedback type,
 * rather than by reading the CRD object. That is the condition that actually gates
 * creating a Feedback, it needs no permission on `customresourcedefinitions`, and it
 * accounts for Rancher's schema cache — a CRD that exists but isn't yet served is, for
 * our purposes, not there.
 */
export async function ensurePrereqs(store: any): Promise<Prereqs> {
  const crd = !!schemaFor(store, FEEDBACK_TYPE);
  let namespace = false;

  if (schemaFor(store, NAMESPACE_TYPE)) {
    try {
      await store.dispatch(ns('find'), { type: NAMESPACE_TYPE, id: NAMESPACE });
      namespace = true;
    } catch {
      namespace = false;
    }
  } else {
    // No schema means no visibility, not necessarily absence. Assume it's there and let
    // the create call be the judge; a 404 there is a clearer error than a wrong banner.
    namespace = true;
  }

  let needsUpdate = false;
  let canUpdate = false;

  if (crd) {
    // Read the installed CRD to compare its schema revision with the one we ship. Reading
    // needs no admin rights (the RBAC grants CRD get/list to authenticated users); the
    // update itself does, which `canUpdate` reflects via the object's own update link.
    try {
      const installed = await store.dispatch(ns('find'), { type: CRD_TYPE, id: CRD_NAME });
      const revision = installed?.metadata?.annotations?.[SCHEMA_REVISION_ANNOTATION];

      needsUpdate = revision !== CRD_SCHEMA_REVISION;
      canUpdate = typeof installed?.hasLink === 'function' ? installed.hasLink('update') : false;
    } catch {
      // Can't read the CRD (e.g. RBAC) — don't nag about an update we can't verify.
      needsUpdate = false;
    }
  }

  return {
    crd,
    namespace,
    canInstall: canCreate(store, CRD_TYPE) && canCreate(store, NAMESPACE_TYPE),
    needsUpdate,
    canUpdate,
  };
}

/**
 * Creates whatever `ensurePrereqs` found missing, then waits for Steve to serve the new
 * schema. Admin-only; a non-admin gets a 403 from `save()` which the dialog surfaces.
 */
export async function installPrereqs(store: any, prereqs: Prereqs): Promise<void> {
  if (!prereqs.namespace) {
    const namespace = await store.dispatch(ns('create'), {
      type: NAMESPACE_TYPE,
      ...FEEDBACK_NAMESPACE_MANIFEST(NAMESPACE),
    });

    await namespace.save();
  }

  if (!prereqs.crd) {
    const crd = await store.dispatch(ns('create'), { type: CRD_TYPE, ...FEEDBACK_CRD });

    await crd.save();
    await waitForFeedbackSchema(store);
  }
}

/**
 * Updates an already-installed CRD in place to the schema this extension ships — how the
 * "Update" button applies a newer revision (e.g. one that adds status.previewUrl) without
 * anyone running `kubectl apply`.
 *
 * Fetches the live object first so its `resourceVersion` is preserved on save, then
 * overwrites the spec and stamps the new revision annotation. Admin-only; a non-admin
 * gets a 403 which the dialog surfaces.
 */
export async function updatePrereqs(store: any): Promise<void> {
  const installed = await store.dispatch(ns('find'), { type: CRD_TYPE, id: CRD_NAME });

  installed.spec = FEEDBACK_CRD.spec;
  installed.metadata.annotations = {
    ...(installed.metadata.annotations || {}),
    [SCHEMA_REVISION_ANNOTATION]: CRD_SCHEMA_REVISION,
  };

  // No schema wait here: the Feedback type already exists, and updating its schema (e.g.
  // adding status.previewUrl) doesn't change that. Rancher refreshes the served schema
  // from its own websocket. The caller re-runs ensurePrereqs, which re-reads the CRD's
  // revision annotation and clears the "update" banner.
  await installed.save();
}

/**
 * A freshly-created CRD is not immediately usable: Kubernetes must establish it and
 * Rancher must serve its schema. We only *poll* `schemaFor` — Rancher keeps the schema
 * cache current from its own websocket subscription.
 *
 * We deliberately do NOT call `loadSchemas`/`findAll('schema', force)` to hurry it along:
 * on Rancher 2.15 `loadSchemas` posts the schema set to a web worker and throws
 * `DataCloneError: … could not be cloned`, and a forced schema `findAll` wipes the cache.
 * Verified against a live cluster.
 */
async function waitForFeedbackSchema(store: any): Promise<void> {
  for (let attempt = 0; attempt < SCHEMA_POLL_ATTEMPTS; attempt++) {
    if (schemaFor(store, FEEDBACK_TYPE)) {
      return;
    }

    await sleep(SCHEMA_POLL_INTERVAL_MS);
  }

  throw new Error('The Feedback CRD was created, but Rancher has not served its schema yet. Reload the page and try again.');
}

export interface CreateFeedbackArgs {
  message: string;
  screenshot: Screenshot;
  page: PageContext;
  submittedBy: string;
  branch?: string;
  repo?: string;
}

/**
 * Writes one Feedback into the local cluster. Returns the saved resource so the caller
 * can link to it.
 *
 * `status` is deliberately not set. It is a subresource, so anything we sent would be
 * dropped, and the CRD's `default: {}` on `status` makes the API server materialise
 * `phase: Pending` by itself. The agent owns everything under `status` from there.
 */
export async function createFeedback(store: any, args: CreateFeedbackArgs): Promise<Feedback> {
  const {
    message, screenshot, page, submittedBy, branch, repo,
  } = args;

  const labels: Record<string, string> = {};

  if (page.clusterId) {
    labels[LABELS.cluster] = labelSafe(page.clusterId);
  }

  if (page.product) {
    labels[LABELS.product] = labelSafe(page.product);
  }

  if (submittedBy) {
    labels[LABELS.submitter] = labelSafe(submittedBy);
  }

  const target: Record<string, string> = {};

  if (branch) {
    target.branch = branch;
  }

  if (repo) {
    target.repo = repo;
  }

  // `page` originates from a reactive Vue prop. Steve echoes created resources back
  // through a web worker (structured clone), which throws on Vue proxies and any other
  // non-plain value. Round-trip through JSON so everything handed to the store is inert,
  // plain data — the screenshot is already a plain base64 string, so this is cheap.
  const spec = JSON.parse(JSON.stringify({
    message:     message.trim(),
    submittedBy,
    submittedAt: new Date().toISOString(),
    page,
    screenshot,
    ...(Object.keys(target).length ? { target } : {}),
  }));

  const resource = await store.dispatch(ns('create'), {
    type:     FEEDBACK_TYPE,
    metadata: {
      name: generateFeedbackName(), namespace: NAMESPACE, labels
    },
    spec,
  });

  await resource.save();

  return resource;
}
