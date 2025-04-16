import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Allow unused variables and arguments prefixed with an underscore
      "@typescript-eslint/no-unused-vars": [
        "warn", // or "error" depending on preference, "warn" is less strict
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // You might need to disable the base ESLint rule if it conflicts
      "no-unused-vars": "off",
    },
  },
];

export default eslintConfig;
