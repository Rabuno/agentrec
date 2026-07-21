export default {
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: { provider: 'v8', reporter: ['text-summary'], include: ['src/**'] },
  },
};
