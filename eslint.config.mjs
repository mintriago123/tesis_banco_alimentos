import {
  nextCoreWebVitals,
  nextTypescript,
} from "@tesis/eslint-next";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "build/**", "coverage/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
