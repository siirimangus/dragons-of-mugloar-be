import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'docs', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  {
    // Purity rule: services never touch the network or the console.
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'fetch', 'console'],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'fetch',
          message: 'Services must not do I/O; depend on the DragonsApi interface instead.',
        },
        {
          object: 'globalThis',
          property: 'console',
          message: 'Services must not do I/O; depend on the DragonsApi interface instead.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:http',
                'node:https',
                'node:http2',
                'node:net',
                'node:tls',
                'http',
                'https',
                'http2',
                'net',
                'tls',
                'undici',
                'axios',
              ],
              message: 'Services must not do I/O; depend on the DragonsApi interface instead.',
            },
          ],
        },
      ],
    },
  },
);
