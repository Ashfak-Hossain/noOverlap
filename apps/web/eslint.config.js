import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        // Pinned rather than left to be inferred. Type-aware rules need to know which TypeScript
        // project a file belongs to, and inference works from the working directory — so running
        // ESLint from the repository root, as an editor does, finds several candidate projects in the
        // workspace and refuses to guess. Naming it here makes the result the same wherever it runs.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
