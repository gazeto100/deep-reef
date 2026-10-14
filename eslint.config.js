// @ts-check
import path from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (see docs/architecture.md).
 *
 * Workspaces
 *   packages/math          -> nothing (pure TypeScript, no libraries, no DOM, no Node)
 *   packages/contract      -> nothing but its schema library
 *   packages/game-service  -> math, contract
 *   apps/web               -> see the client layers below
 *
 * Client layers (apps/web/src)
 *   framework  -> contract, math types           [reusable, game-agnostic]
 *   games      -> framework, contract, math types + config
 *   ui         -> framework, games, contract, math types + config; no pixi.js
 *   transport  -> contract, game-service, math   [the mock runs the game core in the browser]
 *   *.tsx      -> anything (composition root wires the layers together)
 *
 * Every workspace must also declare what it imports (import-x/no-extraneous-dependencies),
 * because npm hoists all packages into the root node_modules.
 */

const ROOT = import.meta.dirname;

// Package names as anchored regexes. A gitignore-style 'react' pattern would also match a
// local folder such as framework/react/, which gives a misleading error.
const RENDER_AND_STATE_LIBS = '^(react|react-dom|pixi\\.js|gsap|howler|redux|react-redux|@reduxjs/[^/]+)(/.*)?$';
const NODE_BUILTINS = '^node:';
const PIXI = '^pixi\\.js(/.*)?$';
const ANY_WORKSPACE = '^@deep-reef/';

const layer = (name) => [`@${name}/*`, `**/${name}/**`];

/** Runtime parts of the math engine. The client only shows results, it never computes them. */
const MATH_RUNTIME = ['@deep-reef/math/engine/*', '@deep-reef/math/rng/*', '@deep-reef/math/analysis/*'];
const GAME_SERVICE = ['@deep-reef/game-service', '@deep-reef/game-service/*'];

const PURE = [
  { regex: RENDER_AND_STATE_LIBS, message: 'This package must stay pure: no rendering, state or animation libraries.' },
  { regex: NODE_BUILTINS, message: 'This package must stay pure: no Node built-ins (it also runs in the browser).' },
];

/**
 * Boundaries apply to production code. Tests run in Node under Vitest, so they may use
 * node:* and test-only helpers (their dependencies are still checked by import-x).
 * @param {string[]} files @param {object[]} patterns
 */
const boundary = (files, patterns) => ({
  files,
  ignores: ['**/*.test.{ts,tsx}'],
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

/** @param {string} workspace */
const declaredDependencies = (workspace) => ({
  files: [`${workspace}/**/*.{ts,tsx,js}`],
  rules: {
    'import-x/no-extraneous-dependencies': [
      'error',
      {
        // The workspace's own package.json, plus the root one for shared dev tooling.
        packageDir: [path.join(ROOT, workspace), ROOT],
        devDependencies: ['**/*.test.{ts,tsx}', '**/scripts/**', '**/*.config.{js,ts}'],
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['**/dist', 'coverage', 'sim-output', '**/node_modules'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: ROOT },
    },
    plugins: { 'import-x': importX },
    settings: {
      // Client layer aliases are local modules, not npm packages.
      'import-x/internal-regex': '^@(framework|games|ui|transport)/',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Cross-workspace imports go through the package name, never ../../other-package.
      'import-x/no-relative-packages': 'error',
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },

  { files: ['apps/web/src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    files: ['packages/*/scripts/**/*.ts', 'apps/*/scripts/**/*.ts', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  { files: ['apps/web/src/**/*.tsx'], extends: [reactHooks.configs.flat['recommended-latest']] },

  // ---- every workspace declares its dependencies ----
  declaredDependencies('packages/math'),
  declaredDependencies('packages/contract'),
  declaredDependencies('packages/game-service'),
  declaredDependencies('apps/web'),

  // ---- workspace boundaries ----
  boundary(
    ['packages/math/src/**'],
    [...PURE, { regex: ANY_WORKSPACE, message: 'The math package cannot depend on any other workspace.' }],
  ),
  boundary(
    ['packages/contract/src/**'],
    [
      ...PURE,
      {
        regex: ANY_WORKSPACE,
        message: 'The contract is language-neutral: it cannot depend on another workspace (not even math).',
      },
    ],
  ),
  boundary(
    ['packages/game-service/src/**'],
    [
      ...PURE,
      {
        regex: '^@deep-reef/(?!math/|contract/)',
        message: 'The game service may only depend on @deep-reef/math and @deep-reef/contract.',
      },
    ],
  ),

  // ---- client layers ----
  boundary(
    ['apps/web/src/framework/**'],
    [
      {
        group: [...layer('games'), ...layer('ui'), ...layer('transport')],
        message: 'src/framework is reusable: it must not know a specific game, the UI or a transport.',
      },
      { group: GAME_SERVICE, message: 'Only src/transport may run the game core.' },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),
  boundary(
    ['apps/web/src/games/**'],
    [
      {
        group: [...layer('ui'), ...layer('transport')],
        message: 'Game configuration must not depend on the UI or a transport.',
      },
      { group: GAME_SERVICE, message: 'Only src/transport may run the game core.' },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),
  boundary(
    ['apps/web/src/ui/**'],
    [
      { regex: PIXI, message: 'React UI reaches Pixi only through src/framework.' },
      { group: layer('transport'), message: 'The UI talks to the server through the injected GameServer interface.' },
      { group: GAME_SERVICE, message: 'Only src/transport may run the game core.' },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),
  boundary(
    ['apps/web/src/transport/**'],
    [
      { regex: RENDER_AND_STATE_LIBS, message: 'Transports are plain TypeScript: no rendering or state libraries.' },
      {
        group: [...layer('framework'), ...layer('games'), ...layer('ui')],
        message: 'Transports must not depend on client layers.',
      },
    ],
  ),

  prettier,
);
