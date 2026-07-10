import {
  CRD_NAME, GROUP, KIND, PLURAL, VERSION
} from '../types/constants';

/**
 * Bump this whenever the schema below changes. It is stamped onto the CRD as an
 * annotation, so the extension can tell whether a cluster's installed CRD is older than
 * the one it ships and offer an in-UI update. History:
 *   1 — initial schema
 *   2 — added status.previewUrl
 */
export const CRD_SCHEMA_REVISION = '2';

export const SCHEMA_REVISION_ANNOTATION = `${ GROUP }/schema-revision`;

/**
 * The single source of truth for the Feedback CRD.
 *
 * It lives in TypeScript rather than YAML because the extension bootstraps and updates the
 * CRD itself (see `ensurePrereqs` / `installPrereqs` / `updatePrereqs` in
 * services/feedback.ts). `deploy/crd.yaml` is *generated* from this object by
 * `yarn gen-crd` — edit here, never there.
 */
export const FEEDBACK_CRD = {
  apiVersion: 'apiextensions.k8s.io/v1',
  kind:       'CustomResourceDefinition',
  metadata:   {
    name:        CRD_NAME,
    labels:      {
      'app.kubernetes.io/name':    'rancher-feedback',
      'app.kubernetes.io/part-of': 'rancher-feedback',
    },
    annotations: {
      [SCHEMA_REVISION_ANNOTATION]: CRD_SCHEMA_REVISION,
    },
  },
  spec: {
    group: GROUP,
    scope: 'Namespaced',
    names: {
      kind:       KIND,
      listKind:   `${ KIND }List`,
      plural:     PLURAL,
      singular:   KIND.toLowerCase(),
      shortNames: ['fb'],
    },
    versions: [
      {
        name:         VERSION,
        served:       true,
        storage:      true,
        subresources: { status: {} },

        additionalPrinterColumns: [
          {
            name: 'Phase', type: 'string', jsonPath: '.status.phase'
          },
          {
            name: 'Product', type: 'string', jsonPath: '.spec.page.product'
          },
          {
            name: 'Submitted By', type: 'string', jsonPath: '.spec.submittedBy'
          },
          {
            name: 'Preview', type: 'string', jsonPath: '.status.previewUrl'
          },
          {
            name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp'
          },
        ],

        schema: {
          openAPIV3Schema: {
            type:        'object',
            description: 'A single piece of UI feedback captured from the Rancher dashboard: what the user wants changed, plus an annotated screenshot of the screen they were looking at when they asked for it.',
            required:    ['spec'],
            properties:  {
              spec: {
                type:       'object',
                required:   ['message', 'screenshot'],
                properties: {
                  message: {
                    type:        'string',
                    description: 'What the user wants changed, in their own words.',
                    minLength:   1,
                    maxLength:   8192,
                  },
                  submittedBy: { type: 'string', description: 'Rancher username of the submitter.' },
                  submittedAt: { type: 'string', format: 'date-time' },

                  page: {
                    type:        'object',
                    description: 'Where in the dashboard the screenshot was taken.',
                    properties:  {
                      url:          { type: 'string' },
                      route:        { type: 'string', description: 'Vue router route name, e.g. c-cluster-product-resource.' },
                      product:      { type: 'string', description: 'Rancher product, e.g. explorer, fleet, manager.' },
                      clusterId:    { type: 'string', description: 'Cluster the user was viewing (not necessarily where this CR lives).' },
                      resourceType: { type: 'string' },
                      viewport:     {
                        type:       'object',
                        properties: {
                          width:  { type: 'integer' },
                          height: { type: 'integer' },
                        },
                      },
                    },
                  },

                  target: {
                    type:        'object',
                    description: 'Hints for the downstream agent about where to apply the change.',
                    properties:  {
                      branch: { type: 'string', description: 'Git branch the user is running; the agent commits here.' },
                      repo:   { type: 'string' },
                    },
                  },

                  screenshot: {
                    type:        'object',
                    description: 'The flattened, annotated image. Held inline so a feedback is one object. Keep under ~900KB of base64; etcd rejects objects over roughly 1.5MiB.',
                    required:    ['contentType', 'data'],
                    properties:  {
                      contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] },
                      encoding:    {
                        type: 'string', enum: ['base64'], default: 'base64'
                      },
                      width:       { type: 'integer' },
                      height:      { type: 'integer' },
                      data:        { type: 'string', description: 'Base64-encoded image bytes, with no data-URI prefix.' },
                    },
                  },
                },
              },

              status: {
                type:        'object',
                description: 'Written by the downstream agent, never by the UI extension.',
                // Without `default: {}` here, `status` is simply absent on a freshly
                // created Feedback, so defaulting never descends into it and
                // `status.phase` stays empty until the agent first writes it. With it,
                // the API server materialises `phase: Pending` — on the read path too,
                // so `kubectl get feedbacks` and the agent's watch both see a real phase
                // from the moment the object exists.
                default:     {},
                properties:  {
                  phase: {
                    type: 'string', enum: ['Pending', 'Processing', 'Done', 'Failed'], default: 'Pending'
                  },
                  message:            { type: 'string', description: 'Human-readable detail about the current phase.' },
                  branch:             { type: 'string' },
                  commit:             { type: 'string' },
                  prUrl:              { type: 'string' },
                  previewUrl:         { type: 'string', description: 'URL of the deployed preview where the applied change can be viewed. The agent fills this in once its deploy is live.' },
                  observedGeneration: { type: 'integer', format: 'int64' },
                  conditions:         {
                    type:  'array',
                    items: {
                      type:       'object',
                      required:   ['type', 'status'],
                      properties: {
                        type:               { type: 'string' },
                        status:             { type: 'string' },
                        reason:             { type: 'string' },
                        message:            { type: 'string' },
                        lastUpdateTime:     { type: 'string' },
                        lastTransitionTime: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};

export const FEEDBACK_NAMESPACE_MANIFEST = (name: string) => ({
  apiVersion: 'v1',
  kind:       'Namespace',
  metadata:   {
    name,
    labels: {
      'app.kubernetes.io/name':    'rancher-feedback',
      'app.kubernetes.io/part-of': 'rancher-feedback',
    },
  },
});
