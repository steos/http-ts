/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  coverageReporters: ["html", "text-summary"],
  coverageDirectory: "./coverage",
  collectCoverageFrom: ["**/*.{ts,tsx}", "!**/*.test.{ts,tsx}"],
  preset: "ts-jest",
};
