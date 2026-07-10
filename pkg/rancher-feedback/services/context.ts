import type { PageContext } from '../types/feedback';

/** Norman type for the logged-in principal; see @shell/config/types NORMAN.PRINCIPAL. */
const NORMAN_PRINCIPAL = 'principal';

interface Route {
  name?: string | null;
  fullPath?: string;
  params?: Record<string, string>;
}

/**
 * Answers "where was the user standing when they hit the button?" — the context the
 * downstream agent needs to find the right component in the dashboard source.
 *
 * Read off the route rather than the store where possible: on global pages (Extensions,
 * Users, Fleet) there is no current cluster, and we still want a usable record.
 */
export function pageContext(store: any, route: Route, product?: string): PageContext {
  const params = route?.params || {};

  return {
    url:          window.location.href,
    route:        route?.name || '',
    product:      product || store.getters['currentProduct']?.name || params.product || '',
    clusterId:    store.getters['currentCluster']?.id || params.cluster || '',
    resourceType: params.resource || '',
    viewport:     {
      width:  window.innerWidth,
      height: window.innerHeight,
    },
  };
}

/** The submitter's login name, falling back to the principal ID when it isn't loaded. */
export function currentUser(store: any): string {
  const principalId = store.getters['auth/principalId'];

  if (!principalId) {
    return 'unknown';
  }

  const principal = store.getters['rancher/byId']?.(NORMAN_PRINCIPAL, principalId);

  return principal?.loginName || principal?.name || principalId;
}
