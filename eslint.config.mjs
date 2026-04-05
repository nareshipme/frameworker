import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...tseslint.configs.recommended,

  globalIgnores([
    'dist/**',
    'node_modules/**',
    '**/*.d.ts',
  ]),

  {
    rules: {
      // No unused variables (prefix with _ to intentionally ignore)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // No explicit any — forces proper typing
      '@typescript-eslint/no-explicit-any': 'error',

      // No var — use const/let only
      'no-var': 'error',

      // Prefer const where variable is never reassigned
      'prefer-const': 'error',

      // Always use === not ==
      eqeqeq: ['error', 'always'],

      // No dead code
      'no-unreachable': 'error',

      // No duplicate imports
      'no-duplicate-imports': 'error',

      // Complexity limit — raised to 20 to accommodate async rendering orchestration
      complexity: ['error', 20],
    },
  },
]);
