import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  planRules,
  readAllowedUids,
  renderBlock,
  renderFile,
} from "../scripts/generate-firebase-rules.mjs";

const FAKE_UID_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FAKE_UID_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/** allowedUids 값을 임시 SSoT 파일에 담아 경로를 돌려준다 — 검증은 파일을 읽는 경로로만 들어온다. */
function sourceFileWith(allowedUids: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "artkit-allowed-uids-"));
  const filePath = path.join(dir, "allowed-uids.json");
  writeFileSync(filePath, JSON.stringify({ allowedUids }));
  return filePath;
}

describe("firebase 허용 uid SSoT", () => {
  it("커밋된 rules 가 firebase/allowed-uids.json 과 갈라지지 않았다", () => {
    // Firebase 규칙에는 include 가 없어 두 파일이 물리적으로 분리돼 있다.
    // 한쪽만 손으로 고치면 한 저장소가 열린 채 남으므로 여기서 시끄럽게 실패시킨다.
    for (const { targetFile, current, rendered } of planRules()) {
      expect(current, `${targetFile} 가 allowed-uids.json 과 다르다 — npm run rules:build`).toBe(
        rendered,
      );
    }
  });

  it("허용 목록이 비면 전원 거부로 렌더된다", () => {
    // `uid in []` 은 항상 거짓이다. 빈 목록이 '전원 허용'으로 읽히면 안 된다.
    expect(renderBlock([])).toContain("return uid in [];");
  });

  it("허용 uid 를 넣으면 두 rules 파일이 같은 목록으로 렌더된다", () => {
    for (const { current, targetFile } of planRules()) {
      const rendered = renderFile(current, [FAKE_UID_A, FAKE_UID_B], targetFile);
      expect(rendered).toContain(`"${FAKE_UID_A}",`);
      // 마지막 항목에는 쉼표가 없다 — 규칙 언어의 리스트 리터럴이 후행 쉼표를 받지 않는다.
      expect(rendered).toContain(`"${FAKE_UID_B}"\n`);
      expect(rendered).not.toContain(`"${FAKE_UID_B}",`);
      expect(rendered).not.toContain("return uid in [];");
    }
  });

  it("마커가 없는 파일은 조용히 통과하지 않고 거부한다", () => {
    expect(() => renderFile("rules_version = '2';\n", [], "fake.rules")).toThrow(/마커/);
  });

  it("uid 가 아닌 값은 거부한다", () => {
    expect(() => readAllowedUids(sourceFileWith(["not-a-uid@example.com"]))).toThrow(
      /uid 형태가 아니다/,
    );
    expect(() => readAllowedUids(sourceFileWith(["short"]))).toThrow(/uid 형태가 아니다/);
    expect(() => readAllowedUids(sourceFileWith([123]))).toThrow(/문자열이 아니다/);
    expect(() => readAllowedUids(sourceFileWith([FAKE_UID_A, FAKE_UID_A]))).toThrow(/중복/);
    expect(() => readAllowedUids(sourceFileWith(undefined))).toThrow(/allowedUids 배열이 없다/);
  });
});
