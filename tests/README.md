# Nova Bot - Testing Documentation

## Overview

This directory contains comprehensive tests for Nova Bot's critical functionality. Tests are built using **Jest**, a popular JavaScript testing framework.

## Test Structure

```
tests/
├── unit/                          # Unit tests for individual modules
│   ├── responseGenerator.test.js  # Cost calculation tests
│   ├── contextLoader.test.js      # Database query tests
│   └── pdfProcessing.test.js      # PDF handling tests
├── mocks/                         # Mock objects for testing
│   ├── supabase.mock.js          # Mock Supabase client
│   ├── whatsapp.mock.js          # Mock WhatsApp messages
│   └── fixtures/                  # Test data
│       └── messages.json          # Sample messages
└── setup.js                       # Jest test environment setup
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/unit/responseGenerator.test.js

# Run tests in verbose mode
npm run test:verbose
```

## Test Coverage

### What's Tested

✅ **Cost Calculations** (13 tests)
- Token cost calculations for different Claude models
- Pricing accuracy for Sonnet 4.5, Haiku, GPT-4o
- Floating point precision handling
- Monthly cost projections
- Model comparisons

✅ **Context Loading** (14 tests)
- Knowledge base queries
- Today's message filtering
- Time range queries
- Data format transformations
- Error handling
- Empty result scenarios

✅ **PDF Processing** (18 tests)
- Text extraction from valid PDFs
- File size validation (10MB limit)
- MIME type checking
- Empty/scanned PDF handling
- Text truncation (50K character limit)
- Error recovery
- Character encoding (UTF-8)
- Integration scenarios

**Total: 45 tests covering critical Nova functionality**

### What's NOT Tested (Yet)

⚠️ These are areas for future test expansion:
- WhatsApp client initialization
- Mention detection logic
- Knowledge compilation process
- Hourly/daily jobs
- Full end-to-end message flow

## Test Philosophy

### Why Unit Tests?

Unit tests verify individual functions work correctly in isolation. Benefits:

1. **Catch bugs early** - Before deployment
2. **Confidence in changes** - Refactor without fear
3. **Documentation** - Tests show how code should work
4. **Faster debugging** - Tests pinpoint exact failures

### Testing Approach

We use **mocking** to test logic without external dependencies:

```javascript
// Instead of hitting real Supabase:
const mockSupabase = new MockSupabaseClient();
mockSupabase.setMockData('knowledge_base', testData);

// We can test the query logic independently
const result = await contextLoader.loadFullContext(chatId);
```

## Key Concepts You Learned

### 1. Test Structure
```javascript
describe('Feature', () => {           // Group related tests
  test('does something', () => {       // Individual test
    expect(result).toBe(expected);     // Assertion
  });
});
```

### 2. Async Testing
```javascript
test('async function', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### 3. Mocking
```javascript
// Mock external service
jest.mock('pdf-parse', () => {
  return jest.fn(() => Promise.resolve({ text: 'mock text' }));
});
```

### 4. Setup/Teardown
```javascript
beforeEach(() => {
  // Runs before each test
  mockData = freshCopy();
});

afterEach(() => {
  // Cleanup after each test
  mockData.reset();
});
```

### 5. Floating Point Precision
```javascript
// WRONG (fails due to JavaScript precision)
expect(0.1 + 0.2).toBe(0.3);  // Actually 0.30000000000000004

// RIGHT (checks within tolerance)
expect(0.1 + 0.2).toBeCloseTo(0.3, 6);  // Pass!
```

## Common Jest Matchers

```javascript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality (objects)

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(4.5, 2);      // Within 2 decimal places

// Strings
expect(string).toContain('substring');
expect(string).toMatch(/regex/);

// Arrays/Objects
expect(array).toHaveLength(3);
expect(object).toHaveProperty('key');

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');
```

## Writing New Tests

When adding a new feature to Nova:

1. **Create test file first** (Test-Driven Development)
```bash
touch tests/unit/newFeature.test.js
```

2. **Write failing tests**
```javascript
describe('New Feature', () => {
  test('should do something', () => {
    const result = newFeature();
    expect(result).toBe('expected');
  });
});
```

3. **Run tests** (they fail)
```bash
npm test
```

4. **Implement feature** until tests pass

5. **Refactor** with confidence (tests ensure it still works)

## Best Practices

### DO ✅
- Test one thing per test
- Use descriptive test names
- Mock external dependencies
- Test edge cases (empty, null, errors)
- Keep tests fast (<100ms per test)
- Test the public API, not implementation details

### DON'T ❌
- Don't test third-party libraries
- Don't make real API calls in tests
- Don't write tests that depend on each other
- Don't test private functions (test through public API)
- Don't skip writing tests for "simple" code

## Debugging Failing Tests

```bash
# Run single test in watch mode
npm run test:watch -- tests/unit/responseGenerator.test.js

# Run with verbose output
npm run test:verbose

# Focus on one test (temporarily)
test.only('this specific test', () => { ... });

# Skip a test (temporarily)
test.skip('broken test', () => { ... });
```

## Real-World Example

From your actual Nova logs, we tested this exact scenario:

**Input**: 26,372 input tokens + 400 output tokens
**Model**: Claude Sonnet 4.5
**Expected Cost**: $0.085116

```javascript
test('calculates cost for large request (real example)', () => {
  const result = calculateCost(26372, 400, 'claude-sonnet-4-5-20250929');

  expect(result.totalCost).toBeCloseTo(0.085116, 6);  // ✅ PASSES
});
```

This proves your cost calculation logic is correct!

## Future Improvements

1. **Integration Tests**
   - Test multiple modules working together
   - Mock WhatsApp client and test full message flow

2. **End-to-End Tests**
   - Test complete user journeys
   - May require test database

3. **Performance Tests**
   - Measure response times
   - Test under load

4. **Continuous Integration**
   - Run tests automatically on git push
   - Block merges if tests fail

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Jest Matchers](https://jestjs.io/docs/expect)
- [Testing Best Practices](https://jestjs.io/docs/testing-best-practices)

---

**You've now built a solid testing foundation for Nova!** 🎉

Next time you add a feature, write tests first. It will save you debugging time and give you confidence your code works correctly.
