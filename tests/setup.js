/**
 * Jest Setup File
 * Runs before all tests to configure the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Suppress console output during tests (optional - uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Add custom matchers or global test utilities here if needed
