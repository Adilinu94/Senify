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
  {
    // Browser probes: injected into the captured page as init scripts, so
    // they run IN the browser and legitimately touch window/document. The
    // files are unchanged MIT copies (probes/README.md) — their defensive
    // `catch (_) {}` blocks stay as published, so the two style rules are
    // switched off for this folder only.
    files: ["packages/framer-import/probes/**/*.mjs"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        location: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly",
        IntersectionObserver: "readonly",
        MutationObserver: "readonly",
        Element: "readonly",
        Node: "readonly",
        EventTarget: "readonly",
        CSSRule: "readonly",
        module: "readonly",
      },
    },
    rules: {
      "no-empty": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Gate-Skripte des Repos (Node, kein Browser). `build-*.mjs` sind die
    // Hilfsskripte, die `build.mjs` aufruft (z. B. build-fonts.mjs): gleiche
    // Laufzeit, gleiche Globals.
    files: ["scripts/**/*.mjs", "packages/*/build.mjs", "packages/*/build-*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
      },
    },
  },
);
