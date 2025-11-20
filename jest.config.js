module.exports = {
  // Use Node environment for testing
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/v3/**/*.js',
    '!src/v3/index.js',  // Skip entry point
    '!**/node_modules/**'
  ],

  // Coverage thresholds (we'll start low and increase)
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Timeout for async tests (increased for API calls)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true
};
