// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (see docs/architecture.md). Each layer may only import what
 * the table allows; both the @alias form and relative paths are covered.
 *
 *   math       -> nothing (pure TypeScript, no libraries, no DOM, no Node)
 *   server     -> math
 *   framework  -> math (types only), server (types only)    [reusable, game-agnostic]
 *   games      -> framework, math (types + config), server (types only)
 *   ui         -> framework, games, math (types + config), server (types only); no pixi.js
 *   src/*.tsx  -> anything (composition root wires the layers together)
 */

// Package names as anchored regexes. A gitignore-style 'react' pattern would also match a
// local folder such as framework/react/, which gives a misleading error.
const RENDER_AND_STATE_LIBS = '^(react|react-dom|pixi\\.js|gsap|howler|redux|react-redux|@reduxjs/[^/]+)(/.*)?$';
const NODE_BUILTINS = '^node:';
const PIXI = '^pixi\\.js(/.*)?$';

const layer = (name) => [`@${name}/*`, `**/${name}/**`];

/** Runtime parts of the math engine. The client only shows results, it never computes them. */
const MATH_RUNTIME = [
  '@math/engine/*',
  '@math/rng/*',
  '@math/analysis/*',
  '**/math/engine/**',
  '**/math/rng/**',
  '**/math/analysis/**',
];

/** @param {string[]} files @param {object[]} patterns */
const boundary = (files, patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'sim-output', 'node_modules'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },

  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/**/*.ts', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  { files: ['src/**/*.tsx'], extends: [reactHooks.configs.flat['recommended-latest']] },

  // ---- layer boundaries ----
  boundary(
    ['src/math/**'],
    [
      { regex: RENDER_AND_STATE_LIBS, message: 'src/math must stay pure: no rendering, state or animation libraries.' },
      { regex: NODE_BUILTINS, message: 'src/math must stay pure: no Node built-ins (it also runs in the browser).' },
      {
        group: [...layer('framework'), ...layer('games'), ...layer('server'), ...layer('ui')],
        message: 'src/math cannot depend on any other layer.',
      },
    ],
  ),
  boundary(
    ['src/server/**'],
    [
      { regex: RENDER_AND_STATE_LIBS, message: 'The server layer has no rendering or client-state code.' },
      {
        group: [...layer('framework'), ...layer('games'), ...layer('ui')],
        message: 'The server may only depend on src/math.',
      },
    ],
  ),
  boundary(
    ['src/framework/**'],
    [
      {
        group: [...layer('games'), ...layer('ui')],
        message: 'src/framework is reusable and must not know about a specific game or the UI.',
      },
      {
        group: layer('server'),
        allowTypeImports: true,
        message: 'The client talks to the server through injected interfaces: type imports only.',
      },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),
  boundary(
    ['src/games/**'],
    [
      { group: layer('ui'), message: 'Game configuration must not depend on the UI.' },
      {
        group: layer('server'),
        allowTypeImports: true,
        message: 'The client talks to the server through injected interfaces: type imports only.',
      },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),
  boundary(
    ['src/ui/**'],
    [
      { regex: PIXI, message: 'React UI reaches Pixi only through src/framework.' },
      {
        group: layer('server'),
        allowTypeImports: true,
        message: 'The client talks to the server through injected interfaces: type imports only.',
      },
      {
        group: MATH_RUNTIME,
        allowTypeImports: true,
        message: 'The client only shows results computed by the server: math type imports only.',
      },
    ],
  ),

  prettier,
);
