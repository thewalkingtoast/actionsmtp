module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!node_modules/**',
    '!test/**'
  ],
  testMatch: [
    '**/test/**/*.test.js'
  ],
  verbose: true
};