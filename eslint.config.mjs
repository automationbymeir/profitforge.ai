import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/legacy/**',
      '**/*.js', // Ignore compiled JavaScript files
      '.pulumi/**',
    ],
  },
  {
    // Strict rules for source code
    files: ['**/*.ts'],
    ignores: ['**/test/**', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error', // Enforce proper typing in source
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Relaxed rules for tests
    files: ['**/test/**/*.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any in tests
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! in tests
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
