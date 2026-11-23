module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/evals/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|m?js)$': ['ts-jest', { tsconfig: 'tsconfig.json', useESM: true }],
  },
  transformIgnorePatterns: [],
};
