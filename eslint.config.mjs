import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "out/**",
      "build/**",
      "coverage/**",
      "*.min.js",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
