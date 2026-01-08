import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    ignores: ["node_modules/**", "dist/**", ".sst/**"],
  },
];
