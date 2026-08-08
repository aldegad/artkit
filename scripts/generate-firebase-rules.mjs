#!/usr/bin/env node
/**
 * firebase/allowed-uids.json 하나를 유일한 정의처로 삼아
 * firestore.rules 와 storage.rules 의 generated 블록을 렌더한다.
 *
 * Firebase 보안 규칙에는 include/import 가 없어서 두 파일은 물리적으로 분리돼 있다.
 * 허용 uid 를 양쪽에 손으로 적으면 진실이 둘이 되고 조용히 갈라진다. 그래서 목록은
 * JSON 한 곳에만 두고 두 파일은 여기서 파생시킨다.
 *
 *   node scripts/generate-firebase-rules.mjs           # 렌더해서 쓴다
 *   node scripts/generate-firebase-rules.mjs --check    # 갈라졌으면 exit 1 (테스트/CI 용)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_FILE = path.join(repoRoot, "firebase/allowed-uids.json");
export const TARGET_FILES = [
  path.join(repoRoot, "firestore.rules"),
  path.join(repoRoot, "storage.rules"),
];

const BEGIN_MARKER = "// === BEGIN generated: allowed-uids ===";
const END_MARKER = "// === END generated: allowed-uids ===";

/** uid 문자열은 렌더된 규칙 안에 그대로 들어가므로 형태를 여기서 못 박는다. */
function assertValidUid(uid, index) {
  if (typeof uid !== "string") {
    throw new Error(`allowedUids[${index}] 가 문자열이 아니다: ${JSON.stringify(uid)}`);
  }
  if (!/^[A-Za-z0-9]{20,128}$/.test(uid)) {
    throw new Error(
      `allowedUids[${index}] 가 Firebase uid 형태가 아니다: ${JSON.stringify(uid)} ` +
        `(영숫자 20~128자. 이메일이나 표시 이름이 아니라 Authentication > Users 의 User UID 다)`,
    );
  }
}

export function readAllowedUids(sourceFile = SOURCE_FILE) {
  const parsed = JSON.parse(readFileSync(sourceFile, "utf8"));
  const uids = parsed.allowedUids;
  if (!Array.isArray(uids)) {
    throw new Error(`${sourceFile} 에 allowedUids 배열이 없다`);
  }
  uids.forEach(assertValidUid);
  const duplicates = uids.filter((uid, i) => uids.indexOf(uid) !== i);
  if (duplicates.length > 0) {
    throw new Error(`allowedUids 에 중복이 있다: ${[...new Set(duplicates)].join(", ")}`);
  }
  return uids;
}

/**
 * 빈 목록은 `uid in []` 으로 렌더되어 항상 거짓이다 — 즉 전원 거부가 안전 기본값이다.
 * 자리표시자를 넣지 않는 이유가 이것이다.
 */
export function renderBlock(uids, indent = "    ") {
  const entries =
    uids.length === 0
      ? "[]"
      : [
          "[",
          // 마지막 항목에 쉼표를 붙이지 않는다 — 규칙 언어의 리스트 리터럴은 후행 쉼표를 받지 않는다.
          uids.map((uid) => `${indent}    ${JSON.stringify(uid)}`).join(",\n"),
          `${indent}  ]`,
        ].join("\n");
  return [
    `${indent}${BEGIN_MARKER}`,
    `${indent}// 이 블록은 firebase/allowed-uids.json 에서 생성된다 (npm run rules:build).`,
    `${indent}// 손으로 고치지 마라 — npm test 의 drift 검사가 거부한다.`,
    `${indent}function isAllowedOwner(uid) {`,
    `${indent}  return uid in ${entries};`,
    `${indent}}`,
    `${indent}${END_MARKER}`,
  ].join("\n");
}

export function renderFile(contents, uids, targetFile) {
  const lines = contents.split("\n");
  const beginIndex = lines.findIndex((line) => line.trim() === BEGIN_MARKER);
  const endIndex = lines.findIndex((line) => line.trim() === END_MARKER);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`${targetFile} 에서 generated 블록 마커를 찾지 못했다`);
  }
  const indent = lines[beginIndex].slice(0, lines[beginIndex].indexOf("/"));
  return [
    ...lines.slice(0, beginIndex),
    renderBlock(uids, indent),
    ...lines.slice(endIndex + 1),
  ].join("\n");
}

export function planRules({ sourceFile = SOURCE_FILE, targetFiles = TARGET_FILES } = {}) {
  const uids = readAllowedUids(sourceFile);
  return targetFiles.map((targetFile) => {
    const current = readFileSync(targetFile, "utf8");
    return { targetFile, current, rendered: renderFile(current, uids, targetFile) };
  });
}

function main(argv) {
  const check = argv.includes("--check");
  const drifted = [];
  for (const { targetFile, current, rendered } of planRules()) {
    if (current === rendered) continue;
    drifted.push(path.relative(repoRoot, targetFile));
    if (!check) writeFileSync(targetFile, rendered);
  }

  if (check && drifted.length > 0) {
    console.error(
      `firebase rules drift: ${drifted.join(", ")} 가 firebase/allowed-uids.json 과 다르다. ` +
        `\`npm run rules:build\` 를 돌려라.`,
    );
    process.exit(1);
  }
  console.log(
    check
      ? "firebase rules in sync with firebase/allowed-uids.json"
      : drifted.length > 0
        ? `firebase rules regenerated: ${drifted.join(", ")}`
        : "firebase rules already up to date",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
