import { defineConfig } from "vitest/config";

/**
 * Firebase 보안 규칙 단위 테스트 전용 설정.
 *
 * 이 스위트는 firestore·storage 에뮬레이터가 떠 있어야 돌아가므로 기본 `npm test` 에서
 * 제외돼 있다(`vitest.config.ts` 의 exclude). 실행은 에뮬레이터를 함께 띄우는
 * `npm run test:rules` 하나뿐이다.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.emulator.test.ts"],
    // 규칙 평가 + 에뮬레이터 왕복이라 기본 5초로는 부족하다.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
