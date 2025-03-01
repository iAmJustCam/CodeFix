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
Test Structure
Copytests/
├── fixtures/         # Test files used by tests
├── integration/      # Integration tests
│   └── test-suite.js # Main integration test suite
├── unit/             # Unit tests
│   ├── project-context/
│   ├── variable-analyzer/
│   └── ...
└── run-integration-tests.js # Test runner script
Adding New Tests
To add new unit tests:

Create a new file in tests/unit/ with the .test.js extension
Write tests using the Mocha framework
Run the tests with npm run test:unit

To add new integration tests:

Add a new test function to tests/integration/test-suite.js
Add your test to the runIntegrationTests() function
Add a new npm script in package.json to run your test specifically
Run the test with npm run test:your-test-name

Testing Guidelines

Isolation: Each test should be independent and not rely on state from other tests
Mocking: Use USE_MOCK_AI_FOR_TESTING when testing AI features
Cleanup: Always clean up temporary files and resources
Assertions: Make clear, specific assertions about expected behavior
Coverage: Aim to test all main code paths

Continuous Integration
The test suite is designed to run in CI environments with minimal configuration. Set the following environment variables for optimal testing:
USE_MOCK_AI_FOR_TESTING=true
This will prevent the tests from making real API calls during CI runs.
Test Reports
After running integration tests, reports will be generated in the tests/fixtures/output directory. These reports include:

HTML dashboard reports
JSON data files
Performance metrics

You can view these reports to understand the test results in more detail.
EOF
Update package.json to use the correct mocha path
sed -i '' 's|node_modules/mocha/bin/mocha|node_modules/.bin/mocha|g' package.json
Let the user know we're done
echo "Test files successfully organized!"
Copy
These commands correctly place all the test files in their appropriate directory structure while maintaining the existing import paths by adjusting relative paths in the imports. The directory structure follows the convention of having unit tests organized by component and maintaining the integration test structure.

After running these commands, you should have a well-organized test structure that properly refllects the features in your codebase, and the tests should be runnable using the npm scripts defined in your package.json.
