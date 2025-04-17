module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: [
    'next/core-web-vitals',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript'
  ],
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
  rules: {
    'no-unused-vars': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn', 
    '@typescript-eslint/no-explicit-any': 'warn',
    'prefer-const': 'warn',
    'eqeqeq': ['warn', 'smart'],
    'import/order': ['error', {
      groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
      pathGroups: [
        {
          pattern: '@/**',
          group: 'internal',
          position: 'after',
        },
      ],
      pathGroupsExcludedImportTypes: ['builtin'],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    }],
    'import/no-duplicates': 'error',
    'import/no-named-as-default': 'warn',
    'import/no-named-as-default-member': 'warn',
    'no-constant-condition': 'warn',
    'no-case-declarations': 'warn',
    'no-useless-escape': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
