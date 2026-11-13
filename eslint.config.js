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
    rules: { 'no-restricted-globals': ['error', 'fetch', 'console'] },
  },
);
