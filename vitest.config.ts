import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // `*.emulator.test.ts` 는 firebase 에뮬레이터가 떠 있어야 돌아간다.
    // 기본 스위트는 에뮬레이터 없이 초록이어야 하므로 여기서 빼고,
    // `npm run test:rules` 가 에뮬레이터와 함께 vitest.rules.config.ts 로 돌린다.
    exclude: [...configDefaults.exclude, "**/*.emulator.test.ts"],
  },
});
