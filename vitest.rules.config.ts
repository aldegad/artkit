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
    // 에뮬레이터 테스트 파일은 한 번에 하나만 돈다.
    //
    // `firebase.json` 이 `singleProjectMode: true` 라 에뮬레이터가 projectId 별로 ruleset 을
    // 나누지 않는다. 그래서 두 파일이 병렬로 각자 `initializeTestEnvironment` 를 부르면 나중
    // 파일이 앞 파일의 규칙을 덮어써서, 아무 잘못 없는 쪽이 `storage/unauthorized` 로 죽는다.
    // 지금은 파일이 하나뿐이라 안 터지지만, 두 번째 파일을 추가하는 사람이 원인 불명 실패를
    // 만나게 되므로 여기서 막는다.
    fileParallelism: false,
    // 규칙 평가 + 에뮬레이터 왕복이라 기본 5초로는 부족하다.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
