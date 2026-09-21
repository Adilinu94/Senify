import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "Repos/**", "docs/**", ".scratch/**", "**/.astro/**", "**/.bake/**", "**/spike-dist/**", "packages/renderer/astro-template/src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/app/public/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        location: "readonly",
        history: "readonly",
        fetch: "readonly",
        prompt: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        localStorage: "readonly",
        FormData: "readonly",
        Node: "readonly",
        URL: "readonly",
        IntersectionObserver: "readonly",
        EventSource: "readonly",
      },
    },
  },
);
