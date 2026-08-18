// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // vitest.config.ts and dockerBuild.js sit outside tsconfig's Src/**
        // include, so the project service cannot type them. Without this they
        // fail to parse entirely — no rules run on them at all, and CI reports
        // two permanent errors it can never clear.
        projectService: {
          allowDefaultProject: ['dockerBuild.js', 'vitest.config.ts']
        },
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
    // A four-line CommonJS build script. Type-aware rules judge it as untyped
    // TypeScript and produce a wall of noise about `require`; syntax and
    // correctness rules still apply, which is the coverage worth having.
    files: ['dockerBuild.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
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
