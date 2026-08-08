import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getMetadata, ref, uploadString } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readAllowedUids, renderFile } from "../scripts/generate-firebase-rules.mjs";

/**
 * 허용 uid 게이트의 런타임 검증. 규칙은 텍스트라 눈으로 읽어서는 믿을 수 없고,
 * 에뮬레이터가 실제로 평가한 결과만 근거가 된다.
 *
 * 실행: `npm run test:rules` (firestore·storage 에뮬레이터를 함께 띄운다)
 *
 * 커밋된 `firebase/allowed-uids.json` 은 비어 있으므로, 허용된 경우를 재현하려면
 * 규칙을 합성 uid 로 렌더해야 한다. 그래서 rules 파일을 그대로 읽지 않고 생성기의
 * `renderFile` 로 목록만 갈아끼운다 — 실제로 배포될 구조를 그대로 시험하면서
 * 사용자의 진짜 uid 없이 돌아간다.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const ALLOWED_UID = "alexAllowedUid00000000000001";
const STRANGER_UID = "strangerUid000000000000000001";

const PROJECT_COLLECTIONS = ["imageProjects", "videoProjects", "spriteProjects"] as const;

function rulesFor(file: string, allowedUids: string[]): string {
  const target = path.join(repoRoot, file);
  return renderFile(readFileSync(target, "utf8"), allowedUids, target);
}

function createEnv(projectId: string, allowedUids: string[]): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: rulesFor("firestore.rules", allowedUids) },
    storage: { rules: rulesFor("storage.rules", allowedUids) },
  });
}

const storagePathFor = (uid: string) => `users/${uid}/media/clip.png`;

async function seedStorageObject(env: RulesTestEnvironment, uid: string): Promise<void> {
  // 없는 객체를 읽으면 권한과 무관하게 404 라서, 읽기 판정을 하려면 먼저 심어야 한다.
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), storagePathFor(uid)), "seed");
  });
}

describe("허용 목록에 uid 가 있을 때", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await createEnv("artkit-rules-allowlisted", [ALLOWED_UID]);
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
  });

  for (const collection of PROJECT_COLLECTIONS) {
    it(`허용 uid 는 자기 ${collection} 를 읽고 쓴다`, async () => {
      const db = env.authenticatedContext(ALLOWED_UID).firestore();
      const target = doc(db, `users/${ALLOWED_UID}/${collection}/p1`);
      await assertSucceeds(setDoc(target, { name: "mine" }));
      await assertSucceeds(getDoc(target));
    });

    it(`허용 목록에 없는 uid 는 자기 ${collection} 도 거부당한다`, async () => {
      const db = env.authenticatedContext(STRANGER_UID).firestore();
      const target = doc(db, `users/${STRANGER_UID}/${collection}/p1`);
      await assertFails(setDoc(target, { name: "stranger" }));
      await assertFails(getDoc(target));
    });

    it(`미인증은 ${collection} 를 거부당한다`, async () => {
      const db = env.unauthenticatedContext().firestore();
      const target = doc(db, `users/${ALLOWED_UID}/${collection}/p1`);
      await assertFails(setDoc(target, { name: "anon" }));
      await assertFails(getDoc(target));
    });

    it(`허용 uid 라도 남의 ${collection} 는 거부당한다`, async () => {
      const db = env.authenticatedContext(ALLOWED_UID).firestore();
      const target = doc(db, `users/${STRANGER_UID}/${collection}/p1`);
      await assertFails(setDoc(target, { name: "not mine" }));
      await assertFails(getDoc(target));
    });
  }

  it("허용 uid 는 자기 Storage 공간을 읽고 쓴다", async () => {
    const storage = env.authenticatedContext(ALLOWED_UID).storage();
    await assertSucceeds(uploadString(ref(storage, storagePathFor(ALLOWED_UID)), "mine"));
    await assertSucceeds(getMetadata(ref(storage, storagePathFor(ALLOWED_UID))));
  });

  it("허용 목록에 없는 uid 는 자기 Storage 공간도 거부당한다", async () => {
    await seedStorageObject(env, STRANGER_UID);
    const storage = env.authenticatedContext(STRANGER_UID).storage();
    await assertFails(uploadString(ref(storage, storagePathFor(STRANGER_UID)), "stranger"));
    await assertFails(getMetadata(ref(storage, storagePathFor(STRANGER_UID))));
  });

  it("미인증은 Storage 를 거부당한다", async () => {
    await seedStorageObject(env, ALLOWED_UID);
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadString(ref(storage, storagePathFor(ALLOWED_UID)), "anon"));
    await assertFails(getMetadata(ref(storage, storagePathFor(ALLOWED_UID))));
  });

  it("허용 uid 라도 남의 Storage 공간은 거부당한다", async () => {
    await seedStorageObject(env, STRANGER_UID);
    const storage = env.authenticatedContext(ALLOWED_UID).storage();
    await assertFails(uploadString(ref(storage, storagePathFor(STRANGER_UID)), "not mine"));
    await assertFails(getMetadata(ref(storage, storagePathFor(STRANGER_UID))));
  });
});

describe("커밋된 rules 파일 그대로", () => {
  // 위 두 절은 목록을 합성 값으로 갈아끼워 구조를 시험한다. 여기는 갈아끼우지 않고
  // 배포될 파일을 그대로 올려, 커밋된 허용 목록이 실제로 그 uid 를 통과시키는지 본다.
  let env: RulesTestEnvironment;
  const committedUids: string[] = readAllowedUids();

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "artkit-rules-as-committed",
      firestore: { rules: readFileSync(path.join(repoRoot, "firestore.rules"), "utf8") },
      storage: { rules: readFileSync(path.join(repoRoot, "storage.rules"), "utf8") },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
  });

  for (const uid of committedUids) {
    it(`커밋된 허용 uid ${uid.slice(0, 6)}… 는 자기 공간을 읽고 쓴다`, async () => {
      const context = env.authenticatedContext(uid);
      const target = doc(context.firestore(), `users/${uid}/videoProjects/p1`);
      await assertSucceeds(setDoc(target, { name: "mine" }));
      await assertSucceeds(getDoc(target));
      await assertSucceeds(uploadString(ref(context.storage(), storagePathFor(uid)), "mine"));
    });
  }

  it("커밋된 목록에 없는 uid 는 자기 공간도 거부당한다", async () => {
    const context = env.authenticatedContext(STRANGER_UID);
    const target = doc(context.firestore(), `users/${STRANGER_UID}/videoProjects/p1`);
    await assertFails(setDoc(target, { name: "stranger" }));
    await assertFails(getDoc(target));
    await assertFails(
      uploadString(ref(context.storage(), storagePathFor(STRANGER_UID)), "stranger"),
    );
  });
});

describe("허용 목록이 비었을 때 (안전 기본값)", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await createEnv("artkit-rules-empty-allowlist", []);
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
  });

  // 빈 목록이 '전원 허용'으로 읽히면 안 된다는 것이 이 절의 전부다.
  for (const collection of PROJECT_COLLECTIONS) {
    it(`인증된 uid 도 자기 ${collection} 를 거부당한다`, async () => {
      const db = env.authenticatedContext(ALLOWED_UID).firestore();
      const target = doc(db, `users/${ALLOWED_UID}/${collection}/p1`);
      await assertFails(setDoc(target, { name: "mine" }));
      await assertFails(getDoc(target));
    });
  }

  it("인증된 uid 도 자기 Storage 공간을 거부당한다", async () => {
    await seedStorageObject(env, ALLOWED_UID);
    const storage = env.authenticatedContext(ALLOWED_UID).storage();
    await assertFails(uploadString(ref(storage, storagePathFor(ALLOWED_UID)), "mine"));
    await assertFails(getMetadata(ref(storage, storagePathFor(ALLOWED_UID))));
  });
});
