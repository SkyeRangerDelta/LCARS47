module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'standard-with-typescript'
  ],
  env: {
    node: true,
    es6: true
  },
  parserOptions: {
    ecmaVersion: 2022
  },
  rules: {
    semi: 'off',
    '@typescript-eslint/semi': ['error', 'always']
  },
  ignorePatterns: [
    'node_modules/',
    'Deploy/'
  ]
};