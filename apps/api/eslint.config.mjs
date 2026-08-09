// @ts-check
import tseslint from 'typescript-eslint';
import globals from 'globals';
import base from '@motoboycity/config/eslint/base';

export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
