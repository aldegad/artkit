#!/usr/bin/env node
// ============================================
// artkit video bundle CLI (agent <-> user collaboration bridge)
// ============================================
//
//   node scripts/artkit-video-bundle.mjs open
//   node scripts/artkit-video-bundle.mjs push <bundle-dir>
//   node scripts/artkit-video-bundle.mjs pull <out.json|out-dir> [--project <id>]
//   node scripts/artkit-video-bundle.mjs list
//
// artkit stores video projects in browser IndexedDB, which is partitioned per
// browser PROFILE as well as per origin. So the browser the agent writes to must
// be the same browser the user edits in. This CLI owns one persistent Chrome
// profile for that shared session:
//
//   live    : the collaboration window is running, so attach over CDP and work in
//             the very session the user is looking at.
//   offline : nothing holds the profile, so open it headless, write, and close.
//
// If the profile is held by something that exposes no CDP port, that is neither
// mode and the command fails instead of guessing.
//
// This CLI never parses project.json. Format knowledge lives in exactly one
// place, domains/video/utils/videoBundle.ts, reached through the in-app bridge.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = process.env.ARTKIT_COLLAB_PROFILE
  ? path.resolve(process.env.ARTKIT_COLLAB_PROFILE)
  : path.join(REPO_ROOT, ".kuma", "artkit-collab-profile");
const PORT = Number(process.env.ARTKIT_PORT || 3005);
const CDP_PORT = Number(process.env.ARTKIT_CDP_PORT || 9333);
const ORIGIN = `http://localhost:${PORT}`;
const EDITOR_URL = `${ORIGIN}/video`;
const BRIDGE_GLOBAL = "__artkitVideoBridge";

// The collaboration window records its debug port INSIDE the profile it opened,
// together with a one-off token it carries in its page URL.
//
// Neither half is optional, because a port is not an identity (both measured
// 2026-08-08 on this machine):
//   - a leftover browser answering on this port swallowed a whole push, and
//   - when the port was already taken, our new Chrome bound [::1] while the
//     stranger held 127.0.0.1, so BOTH answered and the probe picked the wrong one.
// So a session is ours only when the attached browser shows our token.
const ENDPOINT_FILE = ".artkit-cdp.json";
const COLLAB_TOKEN_PARAM = "artkitCollab";

const MANIFEST_FILE = "bundle.json";
const PROJECT_FILE = "project.json";
const MEDIA_DIR = "media";
// Transport tuning, not format: how much base64 crosses the bridge per call.
const CHUNK_LENGTH = 2 * 1024 * 1024;

const USAGE = `artkit video bundle bridge

  open                             협업 브라우저를 띄운다 (이 터미널을 열어둔 채로 사용)
  push <bundle-dir>                번들을 로컬 artkit IndexedDB 에 넣고 /video 에 띄운다
  pull <out.json|out-dir>          현재 편집 상태를 번들 포맷으로 회수한다
      --project <id>               저장된 프로젝트 레코드에서 뽑는다 (기본은 라이브 편집 상태)
  list                             로컬에 저장된 프로젝트 목록

  환경변수: ARTKIT_PORT(${PORT}) ARTKIT_CDP_PORT(${CDP_PORT}) ARTKIT_COLLAB_PROFILE`;

function log(message) {
  console.log(`[bridge] ${message}`);
}

function fail(message) {
  console.error(`[bridge] FAILED — ${message}`);
  process.exitCode = 1;
}

class BridgeError extends Error {}

// ============================================
// Environment probes
// ============================================

async function isDevServerUp() {
  try {
    const response = await fetch(EDITOR_URL, { method: "GET", signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function probeCdpPort(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function endpointPath() {
  return path.join(PROFILE_DIR, ENDPOINT_FILE);
}

/** The collaboration window's port and token, or null when no window of ours runs. */
async function readCollabEndpoint() {
  try {
    const raw = await fs.readFile(endpointPath(), "utf8");
    const endpoint = JSON.parse(raw);
    if (!Number.isInteger(endpoint.port) || !endpoint.token) return null;
    return (await probeCdpPort(endpoint.port)) ? endpoint : null;
  } catch {
    return null;
  }
}

/** True once a CDP target on this port carries our token — the identity check. */
async function portServesToken(port, token) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;
    const targets = await response.json();
    return targets.some((target) => String(target.url || "").includes(token));
  } catch {
    return false;
  }
}

async function writeCollabEndpoint(port, token) {
  await fs.writeFile(
    endpointPath(),
    `${JSON.stringify({ port, token, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

async function clearCollabEndpoint() {
  await fs.rm(endpointPath(), { force: true });
}

async function requireDevServer() {
  if (await isDevServerUp()) return;
  throw new BridgeError(
    `dev 서버가 ${EDITOR_URL} 에 없다. 다른 터미널에서 \`npm run dev\` 를 먼저 띄워라 (포트를 바꿨으면 ARTKIT_PORT).`
  );
}

// ============================================
// Session (live attach or offline profile)
// ============================================

async function openSession() {
  log(`profile=${PROFILE_DIR}`);
  log(`origin=${ORIGIN}`);

  const endpoint = await readCollabEndpoint();
  if (endpoint) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${endpoint.port}`);
    const context = browser.contexts()[0];
    const tokenPage = context
      ?.pages()
      .find((page) => page.url().includes(endpoint.token));
    if (!context || !tokenPage) {
      await browser.close();
      throw new BridgeError(
        `cdp=${endpoint.port} 는 응답하지만 우리 협업 창이 아니다 (토큰 ${endpoint.token} 없음). 그 포트를 쓰는 다른 Chrome 이 있다 — 그것을 닫거나 ARTKIT_CDP_PORT 를 바꿔 \`npm run video:open\` 을 다시 실행해라.`
      );
    }
    log(`mode=live cdp=${endpoint.port} (협업 창에 붙었다 — 사용자가 보고 있는 그 세션이다)`);
    return {
      mode: "live",
      context,
      page: tokenPage,
      // Closing a CDP connection disconnects; it must not kill the user's window.
      close: async () => {
        await browser.close();
      },
    };
  }

  // No collaboration window of ours: open the same profile headless, no debug port.
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  let context;
  try {
    context = await launchCollabProfile({ headed: false });
  } catch (error) {
    if (String(error).includes("ProcessSingleton")) {
      throw new BridgeError(
        `협업 프로필이 이미 사용 중인데 그 창은 이 CLI 가 띄운 것이 아니다 (${endpointPath()} 없음). 그 Chrome 을 닫고 \`npm run video:open\` 으로 다시 띄워라.`
      );
    }
    throw error;
  }
  log("mode=offline (협업 창이 없어서 같은 프로필을 헤드리스로 열었다)");
  return { mode: "offline", context, close: async () => context.close() };
}

/** Launch the collaboration profile itself. Only `open` binds a debug port. */
async function launchCollabProfile({ headed, debugPort }) {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", // bundled Chromium has no H.264, so mp4 clips would not preview
    headless: !headed,
    viewport: null,
    args: debugPort ? [`--remote-debugging-port=${debugPort}`] : [],
  });
}

async function editorPage(session) {
  const context = session.context;
  const existing = session.page || context.pages().find((page) => page.url().startsWith(ORIGIN));
  const page = existing || (await context.newPage());
  if (!page.url().startsWith(`${ORIGIN}/video`)) {
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
  }
  await page.waitForFunction(
    (global) => Boolean(window[global]),
    BRIDGE_GLOBAL,
    { timeout: 30000 }
  ).catch(() => {
    throw new BridgeError(
      `브리지가 window.${BRIDGE_GLOBAL} 에 안 떴다. 프로덕션 빌드를 보고 있거나 /video 가 아니다 — dev 서버(\`npm run dev\`)인지, 또는 NEXT_PUBLIC_ARTKIT_AGENT_BRIDGE=1 인지 확인해라.`
    );
  });
  await page.waitForFunction((global) => window[global].isEditorReady(), BRIDGE_GLOBAL, {
    timeout: 30000,
  });
  return page;
}

// ============================================
// Bundle file I/O (bytes only — no schema knowledge here)
// ============================================

async function readBundleDir(dir) {
  const root = path.resolve(dir);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new BridgeError(`번들 디렉토리가 아니다: ${root}`);
  }

  const manifestJson = await fs.readFile(path.join(root, MANIFEST_FILE), "utf8").catch(() => {
    throw new BridgeError(`${MANIFEST_FILE} 이 없다 — 번들은 포맷을 스스로 선언해야 한다 (${root})`);
  });
  const projectJson = await fs.readFile(path.join(root, PROJECT_FILE), "utf8").catch(() => {
    throw new BridgeError(`${PROJECT_FILE} 이 없다 (${root})`);
  });

  const mediaRoot = path.join(root, MEDIA_DIR);
  const entries = await fs.readdir(mediaRoot, { withFileTypes: true }).catch(() => []);
  const media = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const bytes = await fs.readFile(path.join(mediaRoot, entry.name));
    media.push({ fileName: entry.name, base64: bytes.toString("base64"), byteLength: bytes.length });
  }
  return { root, manifestJson, projectJson, media };
}

function chunk(text, size) {
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += size) {
    chunks.push(text.slice(offset, offset + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================
// Commands
// ============================================

async function commandOpen() {
  await requireDevServer();
  const running = await readCollabEndpoint();
  if (running) {
    throw new BridgeError(
      `협업 창이 이미 떠 있다 (cdp=${running.port}). 그 창을 쓰면 된다 — push/pull 은 거기에 붙는다.`
    );
  }
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await clearCollabEndpoint(); // a stale marker whose port no longer answers

  log(`profile=${PROFILE_DIR}`);
  let context;
  try {
    context = await launchCollabProfile({ headed: true, debugPort: CDP_PORT });
  } catch (error) {
    if (String(error).includes("ProcessSingleton")) {
      throw new BridgeError(
        `협업 프로필이 다른 Chrome 에 잡혀 있다. 그 창을 닫고 다시 실행해라 (profile=${PROFILE_DIR}).`
      );
    }
    throw error;
  }

  // Carry a one-off token in the page URL so later commands can tell this browser
  // apart from any other Chrome that happens to answer on the same port.
  const token = randomUUID();
  const page = context.pages()[0] || (await context.newPage());
  const tokenUrl = `${EDITOR_URL}?${COLLAB_TOKEN_PARAM}=${token}`;
  await page.goto(tokenUrl, { waitUntil: "domcontentloaded" });

  // Chrome starts fine when the debug port is taken, it just exposes nothing there
  // (or binds a different address family while the stranger keeps the other one).
  // Without a port that serves OUR token there is no live mode, so refuse.
  let claimed = false;
  for (let attempt = 0; attempt < 24 && !claimed; attempt += 1) {
    claimed = await portServesToken(CDP_PORT, token);
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!claimed) {
    await context.close();
    throw new BridgeError(
      `CDP 포트 ${CDP_PORT} 가 우리 창을 서비스하지 않는다 — 다른 프로세스가 점유 중이다. ARTKIT_CDP_PORT 로 다른 포트를 지정해라.`
    );
  }
  await writeCollabEndpoint(CDP_PORT, token);

  log(`mode=open cdp=${CDP_PORT} → ${tokenUrl}`);
  log("협업 창을 띄웠다. 이 터미널을 열어둔 채로 편집해라 — 창을 닫으면 세션이 끝난다.");

  await new Promise((resolve) => {
    context.on("close", resolve);
    page.on("close", () => {
      if (context.pages().length === 0) resolve();
    });
  });
  await clearCollabEndpoint();
  log("협업 창이 닫혔다.");
}

async function commandPush(bundleDir) {
  if (!bundleDir) throw new BridgeError("번들 디렉토리를 지정해라 — push <bundle-dir>");
  await requireDevServer();
  const bundle = await readBundleDir(bundleDir);
  const totalBytes = bundle.media.reduce((sum, file) => sum + file.byteLength, 0);
  log(`bundle=${bundle.root} media=${bundle.media.length}개 ${formatBytes(totalBytes)}`);

  const session = await openSession();
  try {
    const page = await editorPage(session);
    const { importId } = await page.evaluate(
      ([global, manifestJson, projectJson]) => window[global].beginImport(manifestJson, projectJson),
      [BRIDGE_GLOBAL, bundle.manifestJson, bundle.projectJson]
    );

    for (const file of bundle.media) {
      const parts = chunk(file.base64, CHUNK_LENGTH);
      for (const part of parts) {
        await page.evaluate(
          ([global, id, fileName, chunkBase64]) =>
            window[global].pushMediaChunk(id, fileName, chunkBase64),
          [BRIDGE_GLOBAL, importId, file.fileName, part]
        );
      }
      log(`media ${file.fileName} (${formatBytes(file.byteLength)}, ${parts.length} chunk)`);
    }

    const result = await page.evaluate(
      ([global, id]) => window[global].commitImport(id, { activate: true }),
      [BRIDGE_GLOBAL, importId]
    );

    for (const warning of result.warnings) log(`warning: ${warning}`);

    // Requirement: confirm the project is actually loaded, not merely stored.
    const live = await page.evaluate(([global]) => window[global].exportLive(), [BRIDGE_GLOBAL]);
    if (live.project.id !== result.projectId) {
      throw new BridgeError(
        `주입은 됐는데 라이브 상태가 다른 프로젝트다 (live=${live.project.id} pushed=${result.projectId})`
      );
    }

    const s = result.summary;
    log(
      `pushed "${result.projectName}" id=${result.projectId} — tracks v${s.videoTrackCount}/a${s.audioTrackCount}, clips v${s.clipCounts.video}/a${s.clipCounts.audio}/i${s.clipCounts.image}, ${s.duration.toFixed(2)}s @${s.frameRate}fps`
    );
    log(`verified: 라이브 에디터가 clips ${live.summary.clipCounts.video + live.summary.clipCounts.audio + live.summary.clipCounts.image}개로 이 프로젝트를 열고 있다`);
    if (session.mode === "offline") {
      log("offline 모드였다 — `npm run video:open` 으로 창을 띄우면 이 프로젝트가 그대로 떠 있다.");
    }
  } finally {
    await session.close();
  }
}

async function commandPull(outTarget, options) {
  if (!outTarget) throw new BridgeError("출력 경로를 지정해라 — pull <out.json|out-dir>");
  await requireDevServer();
  const session = await openSession();
  try {
    const page = await editorPage(session);
    const result = options.projectId
      ? await page.evaluate(
          ([global, id]) => window[global].exportProject(id),
          [BRIDGE_GLOBAL, options.projectId]
        )
      : await page.evaluate(([global]) => window[global].exportLive(), [BRIDGE_GLOBAL]);

    log(`source=${result.source} project="${result.project.name}" id=${result.project.id}`);

    // A clip with no bytes under any of its keys means the dump is incomplete.
    // Writing a bundle anyway would look complete and fail only on re-import, so
    // this is the same loud rule the IN direction already enforces.
    if (result.mediaGaps.length > 0) {
      const lines = result.mediaGaps
        .map((gap) => `  - clip "${gap.clipName}" (${gap.clipId}) — 후보 키 [${gap.candidates.join(", ")}]`)
        .join("\n");
      throw new BridgeError(`미디어 바이트를 못 찾은 클립이 있어서 회수를 중단했다:\n${lines}`);
    }

    const projectJson = `${JSON.stringify(result.project, null, 2)}\n`;
    const asJsonFile = outTarget.toLowerCase().endsWith(".json");
    const out = path.resolve(outTarget);

    if (asJsonFile) {
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, projectJson, "utf8");
      log(`wrote ${out}`);
      if (result.media.length > 0) {
        log(
          `media ${result.media.length}개는 안 썼다 (project.json 단독 출력) — 전체 번들이 필요하면 디렉토리 경로를 줘라`
        );
      }
      return;
    }

    await fs.mkdir(path.join(out, MEDIA_DIR), { recursive: true });
    await fs.writeFile(path.join(out, MANIFEST_FILE), `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(out, PROJECT_FILE), projectJson, "utf8");

    // The bridge already resolved which blob key holds each clip's bytes, using the
    // app's own priority. The CLI just fetches the files it was told about.
    for (const planned of result.media) {
      const handle = await page.evaluate(
        ([global, key]) => window[global].prepareMediaExport(key),
        [BRIDGE_GLOBAL, planned.key]
      );
      const parts = [];
      for (let index = 0; index < handle.chunkCount; index += 1) {
        parts.push(
          await page.evaluate(
            ([global, key, chunkIndex]) => window[global].readMediaExportChunk(key, chunkIndex),
            [BRIDGE_GLOBAL, planned.key, index]
          )
        );
      }
      await page.evaluate(
        ([global, key]) => window[global].releaseMediaExport(key),
        [BRIDGE_GLOBAL, planned.key]
      );
      await fs.writeFile(path.join(out, MEDIA_DIR, handle.fileName), Buffer.from(parts.join(""), "base64"));
      log(`media ${handle.fileName} (${formatBytes(handle.byteLength)}, clips ${planned.clipIds.length})`);
    }
    log(`wrote bundle ${out}`);
  } finally {
    await session.close();
  }
}

async function commandList() {
  await requireDevServer();
  const session = await openSession();
  try {
    const page = await editorPage(session);
    const projects = await page.evaluate(([global]) => window[global].listProjects(), [BRIDGE_GLOBAL]);
    if (projects.length === 0) {
      log("저장된 프로젝트가 없다.");
      return;
    }
    for (const project of projects) {
      log(`${project.id}  ${new Date(project.savedAt).toISOString()}  ${project.name}`);
    }
  } finally {
    await session.close();
  }
}

// ============================================
// Entry
// ============================================

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = { projectId: undefined };
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--project") {
      options.projectId = rest[index + 1];
      index += 1;
      continue;
    }
    positional.push(rest[index]);
  }

  switch (command) {
    case "open":
      return commandOpen();
    case "push":
      return commandPush(positional[0]);
    case "pull":
      return commandPull(positional[0], options);
    case "list":
      return commandList();
    default:
      console.log(USAGE);
      if (command) process.exitCode = 1;
      return undefined;
  }
}

main().catch((error) => {
  if (error instanceof BridgeError) {
    fail(error.message);
    return;
  }
  fail(String(error?.stack || error));
});
