// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // Keep @jellyfin/sdk imports contained to the JellyfinClient module.
    // Issue #35: SDK types must not leak through the rest of the codebase.
    files: ['Src/**/*.ts'],
    ignores: ['Src/Subsystems/Jellyfin/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@jellyfin/sdk', '@jellyfin/sdk/**'],
          message: '@jellyfin/sdk is encapsulated in Src/Subsystems/Jellyfin/. Import the JellyfinClient or its DTOs instead.'
        }]
      }]
    }
  },
  {
    ignores: [
      'Deploy/',
      'docs/',
      'tsconfig.json',
      'eslint.config.mjs',
    ]
  }
);
