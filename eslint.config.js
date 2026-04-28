// Flat-config ESLint setup that enforces the library-discipline rules
// documented in README.md. Library code lives under src/; tests under tests/
// are exempt from rules that conflict with idiomatic Node test code.

import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.js'],
    plugins: { jsdoc },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      // Code-injection safety
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Throw discipline
      'no-throw-literal': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message:
            'Library code must not call process.exit; throw an Error instead.',
        },
        {
          selector: "ImportDeclaration[source.value='node:assert']",
          message:
            'Library code must not import node:assert; throw a typed Error instead.',
        },
      ],

      // Equality
      eqeqeq: ['error', 'always'],

      // Output discipline
      'no-console': 'error',

      // Documentation: every exported function carries JSDoc with params and returns.
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: true,
          },
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-type': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
