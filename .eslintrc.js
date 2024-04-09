module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'love'
  ],
  env: {
    node: true,
    es6: true
  },
  parserOptions: {
    ecmaVersion: 2022
  },
  rules: {
    'semi': [2, 'always'],
    '@typescript-eslint/semi': [2, 'always']
  },
  ignorePatterns: [
    'node_modules/',
    'Deploy/',
    'tsconfig.json',
    '.eslintrc.js'
  ]
};