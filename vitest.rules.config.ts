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
    // 이 스위트의 각 절은 `initializeTestEnvironment` 로 에뮬레이터에 ruleset 을 올린다. 그
    // 업로드가 파일 간에 서로를 밟을 수 있다는 관측이 리뷰에서 나왔다(두 번째 파일을 추가하자
    // 기존 파일이 `storage/unauthorized` 로 죽었다는 보고). **그 기전은 여기서 재현되지
    // 않았다** — 서로 다른 ruleset 을 올리는 두 파일을 병렬로 돌려도 양쪽 다 초록이었고, 한
    // 파일 안에서 projectId 3개가 각자 다른 ruleset 으로 도는 것도 초록이다. 그래서 원인을
    // 단정하지 않는다.
    //
    // 그래도 직렬로 고정한다: 이 스위트는 1초대라 병렬로 얻을 것이 없는 반면, 저 실패가
    // 실재한다면 다음 사람은 자기 규칙이 틀렸다고 오진하게 된다. 값이 싼 쪽으로 둔다.
    fileParallelism: false,
    // 규칙 평가 + 에뮬레이터 왕복이라 기본 5초로는 부족하다.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
