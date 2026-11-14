/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  // zod is ESM+CJS dual; the shared package is TS source and must be transformed.
  transformIgnorePatterns: ["/node_modules/(?!@cb/)"],
  clearMocks: true,
};
