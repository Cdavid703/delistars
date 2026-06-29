import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // delistars-menu-magic es un sub-proyecto aparte con su propio tooling/lint.
  globalIgnores(['dist', 'delistars-menu-magic']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // `catch {}` best-effort es un patrón intencional en esta app.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // No marcar bindings de catch sin usar (`catch (_) {}`) ni vars con prefijo `_`.
      'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
