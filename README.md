# rancher-feedback

A Rancher UI extension that turns "this screen should look different" into a Kubernetes
object an agent can act on.

Click the speech-bubble button in the Rancher header (or press `Ctrl`/`Cmd` + `F`) on any
screen. The extension captures what you are looking at, opens an annotation editor over
it, takes your note, and writes both into the cluster as a `Feedback` custom resource.

A separate agent pipeline — not part of this repo — watches those resources, makes the
code change, commits to your branch, and deploys. It reports progress by writing to
`status`, which the Feedback detail page already renders.

---

## The flow

1. **Click** the header button. The modal is still closed.
2. **Capture.** The DOM is rendered to a canvas (`html-to-image`) — silent, no permission
   prompt. If that fails, it falls back to the browser's native screen capture.
3. **Annotate.** The modal opens with the image already loaded in the editor. Draw arrows,
   boxes, freehand and text; **redact** anything secret; **crop** to what matters.
   Undo/redo up to 25 steps.
4. **Write the note.** Submit stays disabled until it has text — an unannotated screenshot
   with no words gives the agent nothing to work with.
5. **Submit.** The editor canvas is flattened (background + every annotation) into one
   JPEG, compressed to fit the size budget, and written to a `Feedback` CR.

The bytes stored are the bytes you drew on. A redaction is an opaque rectangle rasterised
into the image, not a CSS overlay — the pixels underneath are gone.

## Install

The extension is browser-side JavaScript and cannot ship cluster manifests through its
Helm chart (`publish-pkgs` regenerates the chart from a fixed template). So the `Feedback`
CRD is installed one of two ways:

**Normal path** — apply the manifests:

```bash
kubectl apply -f deploy/namespace.yaml -f deploy/crd.yaml -f deploy/rbac.yaml
```

**Extension-only path** — open the dialog as a cluster admin. If the CRD or namespace is
missing, a banner offers a one-click **Install prerequisites** button that creates them
through Rancher's Steve API. Non-admins get an "ask an admin" message instead.

`deploy/rbac.yaml` lets any authenticated Rancher user file feedback into the
`rancher-feedback` namespace and nowhere else. Drop the `rancher-feedback-submitter`
`ClusterRole`/`RoleBinding` pair if you want to gate it more tightly.

## Develop

Requires Node 24 (`.nvmrc`) and yarn.

```bash
yarn install
API=https://your-rancher.example yarn dev     # https://127.0.0.1:8005
```

```bash
yarn lint                       # eslint, 0 errors
yarn build-pkg rancher-feedback # -> dist-pkg/
yarn serve-pkgs                 # serves dist-pkg on :4500 for Developer Load
yarn gen-crd                    # regenerate deploy/crd.yaml from source
```

To load the built extension into a real Rancher: `yarn build-pkg rancher-feedback && yarn
serve-pkgs`, then in Rancher go to **Extensions → ⋮ → Developer load** and point it at
`http://127.0.0.1:4500/rancher-feedback-0.1.0/rancher-feedback-0.1.0.umd.min.js`.

### Two install gotchas

- `yarn install` prints a long native build failure for `canvas`. It is an **optional**
  dependency of `fabric`, used only for rendering under Node. The install exits 0 and the
  browser build is unaffected. Ignore it.
- Do **not** run `yarn install --ignore-optional`. It prunes `highlight.js` (an optional
  dependency of `diff2html`, which `@rancher/shell` pulls in) and the build then fails
  with dozens of `Module not found` errors.

## The resource

```yaml
apiVersion: feedback.rancher.io/v1alpha1
kind: Feedback
metadata:
  name: fb-20260710-a1b2c3          # generated, chronologically sortable
  namespace: rancher-feedback
spec:
  message: "Move the Save button to the right of Cancel."
  submittedBy: admin
  submittedAt: "2026-07-10T18:04:11Z"
  page:                             # where the user was standing
    url: https://rancher.example/dashboard/c/local/explorer/pods
    route: c-cluster-product-resource
    product: explorer
    clusterId: local
    resourceType: pod
    viewport: { width: 1728, height: 1080 }
  target:
    branch: main                    # optional, free-text in the dialog
  screenshot:
    contentType: image/jpeg
    encoding: base64
    width: 1280
    height: 800
    data: <base64, no data: prefix>
status:                             # the agent owns this; the extension never writes it
  phase: Pending                    # Pending | Processing | Done | Failed
  message: ""
  branch: ""
  commit: ""
  prUrl: ""
```

Feedback always lands in the **local** cluster, in the `rancher-feedback` namespace, no
matter which cluster you were browsing (`spec.page.clusterId` records that). It is written
through the `management` Steve store, which is `/v1` on the Rancher server and is loaded
on every page — including global ones like Extensions, where no cluster store exists.

### For the agent author

- `status` is a **subresource**. Write it with `PATCH .../status`, not by updating the
  object. The API server strips `status` from create requests, so a submitter cannot set
  it, and the enum on `status.phase` is only enforced on the subresource.
- A newly created Feedback reads back as `status: {phase: Pending}` — the CRD's
  `default: {}` on `status` makes the API server materialise it, so you can watch for
  `Pending` from the moment the object exists.
- Labels for selecting: `feedback.rancher.io/cluster`, `feedback.rancher.io/product`,
  `feedback.rancher.io/submitted-by`.
- Unknown fields under `spec` are pruned by the structural schema.
- The screenshot is inline base64 and round-trips byte-for-byte:
  ```bash
  kubectl -n rancher-feedback get feedback <name> \
    -o jsonpath='{.spec.screenshot.data}' | base64 -d > shot.jpg
  ```

### Screenshot size

`etcd` rejects objects over roughly 1.5 MiB. The client compresses to a **900 KB base64
budget**, walking JPEG quality down (0.92 → 0.35) and then resolution down before giving
up. A busy 1280×800 dashboard screenshot lands around 360 KB, so there is comfortable
headroom. If an image still will not fit, submit is blocked with a message telling you to
crop — rather than the API server rejecting it after you have drawn your annotations.

## Layout

```
pkg/rancher-feedback/
  index.ts                     header action, dialog registration, product
  product.ts                   the "Feedback" nav entry and list columns
  types/constants.ts           the one file to edit to rename the API group
  types/feedback.ts            TypeScript mirror of the CRD
  services/crd.ts              single source of truth for the CRD
  services/capture.ts          captureDom / captureDisplayMedia / compressToBudget
  services/feedback.ts         ensurePrereqs, installPrereqs, createFeedback
  services/context.ts          $route + store -> spec.page
  dialogs/FeedbackDialog.vue   the modal: editor left, note right
  components/ScreenshotEditor.vue   fabric.js canvas, undo/redo, crop, flatten-on-export
  components/EditorToolbar.vue      tools, colours, stroke widths
  models/feedback.rancher.io.feedback.js    phase -> state colour, list display
  detail/feedback.rancher.io.feedback.vue   read-only view; the agent window mounts here
deploy/                        crd.yaml (generated), namespace.yaml, rbac.yaml
scripts/gen-crd.mjs            regenerates deploy/crd.yaml from services/crd.ts
```

`deploy/crd.yaml` is **generated**. Edit `pkg/rancher-feedback/services/crd.ts` and run
`yarn gen-crd`. Keeping one source means the YAML you apply and the CRD the extension
bootstraps can never disagree.

## Not built yet

Deliberately out of scope, with the seams left in place:

- **The agent window.** `detail/feedback.rancher.io.feedback.vue` renders `status` today;
  the live agent view mounts in its `agent` section.
- **Region select at capture time**, multiple screenshots per feedback, and wiring the
  editor's "re-capture at full fidelity" button to a region picker. `services/capture.ts`
  is written as an interface so these drop in without touching the dialog.
- **Draft state.** Closing the modal discards the capture and annotations. A half-saved
  feedback is worse than none.
