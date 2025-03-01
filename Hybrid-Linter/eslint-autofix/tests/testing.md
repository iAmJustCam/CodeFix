# Testing Hybrid Linter

This directory contains comprehensive testing for the Hybrid Linter project. The tests are designed to validate that all features are working correctly, both independently and when integrated together.

## Test Types

The test suite includes:

1. **Unit Tests**: Test individual components and functions
2. **Integration Tests**: Test how components work together
3. **Feature Tests**: Test specific features end-to-end

## Running Tests

You can run the tests using npm scripts:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific feature tests
npm run test:parallel     # Test parallel processing
npm run test:cross-file   # Test cross-file analysis
npm run test:ai           # Test AI analysis & confidence
npm run test:rollback     # Test rollback & checkpoints
npm run test:team         # Test team profiles
npm run test:language     # Test language expansion
npm run test:monetization # Test monetization features
npm run test:reporting    # Test visual reporting
npm run test:ide          # Test IDE integration
```

## Test Structure

```
tests/
├── fixtures/         # Test files used by tests
├── integration/      # Integration tests
│   └── test-suite.js # Main integration test suite
├── unit/             # Unit tests
│   ├── project-context.test.js
│   ├── variable-analyzer.test.js
│   └── ...
└── run-integration-tests.js # Test runner script
```

## Adding New Tests

To add new unit tests:

1. Create a new file in `tests/unit/` with the `.test.js` extension
2. Write tests using the Mocha framework
3. Run the tests with `npm run test:unit`

To add new integration tests:

1. Add a new test function to `tests/integration/test-suite.js`
2. Add your test to the `runIntegrationTests()` function
3. Add a new npm script in `package.json` to run your test specifically
4. Run the test with `npm run test:your-test-name`

## Testing Guidelines

1. **Isolation**: Each test should be independent and not rely on state from other tests
2. **Mocking**: Use `USE_MOCK_AI_FOR_TESTING` when testing AI features
3. **Cleanup**: Always clean up temporary files and resources
4. **Assertions**: Make clear, specific assertions about expected behavior
5. **Coverage**: Aim to test all main code paths

## Continuous Integration

The test suite is designed to run in CI environments with minimal configuration. Set the following environment variables for optimal testing:

```
USE_MOCK_AI_FOR_TESTING=true
```

This will prevent the tests from making real API calls during CI runs.

## Test Reports

After running integration tests, reports will be generated in the `tests/fixtures/output` directory. These reports include:

- HTML dashboard reports
- JSON data files
- Performance metrics

You can view these reports to understand the test results in more detail.
