// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'node_modules/',
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'reports/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A missing `await` on a Playwright call is the #1 source of flaky tests.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-networkidle': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-skipped-test': ['warn', { allowConditional: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              message:
                "Import { test, expect } from 'src/fixtures' so data cleanup and auth fixtures always apply.",
            },
          ],
        },
      ],
    },
  },

  // Must stay last: turns off stylistic rules that would fight Prettier.
  prettier,
);
