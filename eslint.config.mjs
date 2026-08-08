import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "coverage/**",
      "node_modules/**",
      // Agent worktrees and the collaboration browser profile. `.gitignore` already
      // excludes `.kuma/`, so nothing here is ours — but the Chrome profile that
      // `npm run video:open` writes there ships bundled extension js, and linting it
      // turns this repo red the first time anyone opens that window.
      ".kuma/**",
    ],
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      // All in-app images are runtime-generated blob/data URLs (thumbnails,
      // conversion previews) or external avatars; the static export build has
      // no image optimizer, so next/image offers no benefit here.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
