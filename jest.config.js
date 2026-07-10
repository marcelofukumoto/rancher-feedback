/**
 * Unit tests for the extension's pure logic (pkg/rancher-feedback/utils).
 *
 * These modules have no Vue, fabric or @rancher/shell dependencies on purpose, so the
 * config stays minimal and does not use @rancher/shell's babel preset — that preset
 * pulls webpack-only plugins (babel-plugin-transform-require-context) that have no place
 * in a test run. babel-jest is pointed at a self-contained preset list instead.
 *
 * Component tests, when added, will need @vue/vue3-jest and the @shell / @components
 * moduleNameMapper the dashboard uses.
 */
module.exports = {
  testEnvironment:      'node',
  roots:                ['<rootDir>/pkg/rancher-feedback'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch:            ['**/__tests__/**/*.test.ts'],
  transform:            {
    '^.+\\.(ts|js)$': ['babel-jest', {
      configFile: false,
      presets:    [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
    }],
  },
};
