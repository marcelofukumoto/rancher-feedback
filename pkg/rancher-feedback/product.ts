import { AGE, NAME as NAME_COL, STATE } from '@shell/config/table-headers';

import { EXTENSION_NAME, FEEDBACK_TYPE } from './types/constants';

export function init($plugin: any, store: any): void {
  const {
    product, basicType, configureType, headers,
  } = $plugin.DSL(store, EXTENSION_NAME);

  product({
    // Feedback lives in the local cluster, so the product reads from the management
    // store and has no use for the cluster switcher.
    inStore:             'management',
    icon:                'comment',
    // Hides the nav entry entirely until the CRD is installed, rather than showing an
    // entry that leads to a 404.
    ifHaveType:          FEEDBACK_TYPE,
    showClusterSwitcher: false,
    weight:              -1,
    labelKey:            'rancherFeedback.product.label',
  });

  configureType(FEEDBACK_TYPE, {
    displayName: 'Feedback',
    isCreatable: false,
    isEditable:  false,
    isRemovable: true,
    canYaml:     true,
  });

  basicType([FEEDBACK_TYPE]);

  headers(FEEDBACK_TYPE, [
    STATE,
    {
      ...NAME_COL,
      labelKey: 'rancherFeedback.table.message',
      value:    'nameDisplay',
      sort:     ['spec.message'],
      search:   ['spec.message'],
    },
    {
      name:     'product',
      labelKey: 'rancherFeedback.table.product',
      value:    'spec.page.product',
      sort:     'spec.page.product',
      search:   'spec.page.product',
    },
    {
      name:     'submittedBy',
      labelKey: 'rancherFeedback.table.submittedBy',
      value:    'spec.submittedBy',
      sort:     'spec.submittedBy',
      search:   'spec.submittedBy',
    },
    {
      name:          'preview',
      labelKey:      'rancherFeedback.table.preview',
      value:         'status.previewUrl',
      // The Link formatter renders an <a> that opens in a new tab (target=_blank) with a
      // safe rel; empty when the agent hasn't deployed a preview yet.
      formatter:     'Link',
      formatterOpts: { options: { target: '_blank', rel: 'noopener noreferrer' } },
      sort:          'status.previewUrl',
    },
    AGE,
  ]);
}
