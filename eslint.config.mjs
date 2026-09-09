export default [
  { ignores: ['node_modules/**', '.output/**', 'dist/**', 'lib/**'] },
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', '.output/**', 'dist/**', 'lib/**'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    rules: {
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
];
