/**
 * Jest setup file for E2E tests
 * Configures environment variables for test database connectivity
 */

// Configure test MongoDB instance (localhost:27018)
// instead of Docker service 'mongo' which cannot be resolved in test environment
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/coach_ai_test';

// Ensure we're in test environment
process.env.NODE_ENV = 'test';
