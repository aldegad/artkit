# 에이전트 영상 협업 번들 (artkit video bundle bridge)

에이전트가 영상 클립과 BGM/SFX 를 타임라인에 배치한 프로젝트를 만들어 로컬 artkit 에 넣고, 사용자가 브라우저에서 같이 다듬고, 사용자가 바꾼 것을 에이전트가 다시 읽는 양방향 경로다. artkit 은 100% 클라이언트 정적앱이고 프로젝트와 미디어는 브라우저 IndexedDB 에 있으므로, CLI 는 앱에 직접 꽂지 않고 실행 중인 앱 안의 브리지를 호출한다.

## 사전 준비

이 CLI 는 `playwright` devDependency 를 쓴다. 새 체크아웃이나 새 워크트리에서는 먼저 설치해야 하고, 안 하면 `ERR_MODULE_NOT_FOUND: playwright` 가 난다.

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

브라우저 다운로드는 건너뛰어도 된다. `channel: "chrome"` 으로 시스템에 설치된 Google Chrome 을 쓰기 때문이다.

## 30초 요약

```bash
npm run dev                              # 터미널 1 — :3005
npm run video:open                       # 터미널 2 — 협업 창을 띄운다 (열어둔 채로)
npm run video:push -- ./my-bundle        # 번들 주입 → 협업 창에 바로 뜬다
# ... 사용자가 협업 창에서 편집 ...
npm run video:pull -- ./pulled           # 편집 결과를 번들로 회수
npm run video:pull -- ./pulled.json      # project.json 만 빠르게 회수
npm run video:list                       # 로컬에 저장된 프로젝트 목록
```

`npm run` 으로 인자를 넘길 때는 `--` 가 필요하다. 직접 부르는 형태가 더 짧다.

```bash
node scripts/artkit-video-bundle.mjs push ./my-bundle
node scripts/artkit-video-bundle.mjs pull ./pulled
```

## 왜 전용 협업 창인가 — 이게 이 도구의 핵심 제약

IndexedDB 는 origin 뿐 아니라 **브라우저 프로필**로 격리된다. 헤드리스 브라우저가 자기 임시 프로필에 프로젝트를 써도 사용자가 평소 쓰는 Chrome 에는 보이지 않는다. 그래서 "에이전트가 주입하고 사용자는 자기 크롬으로 열어본다" 는 구조적으로 성립하지 않는다 — 주입한 저장소와 사용자가 보는 저장소가 다르다.

그래서 이 CLI 는 협업 세션용 Chrome 프로필 하나를 소유한다. 기본 위치는 `.kuma/artkit-collab-profile/` (git 미추적, `ARTKIT_COLLAB_PROFILE` 로 변경). 사용자는 `npm run video:open` 이 띄운 창에서 편집하고, 에이전트는 그 같은 프로필에 붙는다.

실행 모드는 둘이고 매 실행 첫 줄에 찍힌다.

| mode | 언제 | 무엇을 하나 |
|---|---|---|
| `live` | 협업 창이 떠 있을 때 | CDP 로 그 살아있는 세션에 붙는다. 사용자가 창을 닫을 필요가 없고, 주입하면 화면에 바로 반영된다. |
| `offline` | 협업 창이 없을 때 | 같은 프로필을 헤드리스로 열어 쓰고 닫는다. 다음에 `video:open` 하면 그 프로젝트가 떠 있다. |

프로필이 다른 Chrome 에 잡혀 있는데 우리 협업 창이 아니면 두 모드 다 아니고, 조용히 우회하지 않고 실패한다.

`channel: "chrome"` (시스템에 설치된 Google Chrome)을 쓴다. Playwright 번들 Chromium 은 오픈소스 빌드라 H.264 를 못 재생해서 mp4 클립 프리뷰가 죽는다.

## 번들 포맷

번들은 디렉토리다.

```
my-bundle/
├── bundle.json              포맷 선언
├── project.json             SavedVideoProject 그대로
└── media/
    ├── <sourceId>.mp4
    ├── <sourceId>.mp3
    └── ...
```

`bundle.json`:

| 필드 | 필수 | 값 |
|---|---|---|
| `format` | O | `"artkit-video-bundle"` |
| `version` | O | `1` (앱이 지원하는 버전보다 크면 거부) |
| `generator` | X | 만든 주체 |
| `createdAt` | X | ISO 시각 |
| `note` | X | 사람이 읽는 메모 |

`project.json` 은 에디터가 저장하는 `SavedVideoProject` 와 **같은 형태**다 (`domains/video/types/project.ts`). 별도 스키마가 아니라서 앱이 저장한 것을 그대로 다시 넣을 수 있다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 프로젝트 식별자와 이름 |
| `project.canvasSize` | 출력 해상도 `{width, height}` |
| `project.frameRate` | fps |
| `project.duration` | 전체 길이 (클립 끝 최대값) |
| `project.tracks[]` | `VideoTrack` — `type: "video" \| "audio"`, `zIndex` 가 합성 순서 (높을수록 위) |
| `project.clips[]` | `VideoClip` \| `AudioClip` \| `ImageClip` |
| `project.assets[]` | `AssetReference` — **미디어 매니페스트를 겸한다** |
| `project.masks[]` | 마스크 (base64 PNG, 없으면 `[]`) |
| `timelineView` | 타임라인 줌/스크롤/스냅 |
| `currentTime` | 재생헤드 위치 |
| `savedAt` | epoch ms |

클립 공통 필드: `startTime`(타임라인 위치, 초) · `duration`(타임라인 길이) · `trimIn`/`trimOut`(소스 안에서의 구간) · `playbackSpeed` · `opacity` · `position`/`scale`/`rotation`. 오디오는 `audioVolume`(0-100) · `audioMuted`. 비디오는 추가로 `hasAudio` · `sourceDuration` · `sourceSize`.

### 안전 패턴 — 새로 만드는 번들은 식별자 하나로 통일한다

```
asset.id  ==  media/<이 값>.<ext>  ==  IndexedDB blob key  ==  그 소스를 쓰는 모든 clip.sourceId
```

이걸 지키면 로드 시 재바인딩이 항상 성공한다. **어기면 에러가 아니라 클립이 조용히 사라진다** — 앱의 로드 경로(`restoreClipsWithLocalMedia`)는 blob 을 못 찾고 `sourceUrl` 이 죽은 `blob:` 이면 그 클립을 버린다. 그래서 `push` 는 저장 전에 번들을 검증하고, 어떤 클립이 자기 blob 키 어느 쪽으로도 미디어를 못 찾으면 아무것도 쓰지 않고 그 이유를 전부 나열하며 거부한다.

`media/` 파일의 확장자는 `asset.mediaType` 에서 정한다 (`video/mp4` → `.mp4`, `audio/mpeg` → `.mp3`). 모르는 타입은 `.bin` 으로 두고 바이트만 옮긴다.

### media 파일 이름은 blob 키다 — sourceId 가 아닐 수도 있다

에디터는 **한 클립만의 결과물**을 `clip.id` 로 저장한다. 프레임 캡처, 인페인트 출력, 갭 보간이 그렇다. 반면 임포트한 미디어는 여러 클립이 공유하므로 `sourceId` 로 저장된다. 그래서 클립 하나의 바이트를 찾는 순서는 **`clip.id` 먼저, 그다음 `sourceId`** 이고, 그 규칙의 owner 는 `mediaStorage.mediaBlobKeysForClip` 이다.

번들의 `media/<이름>` 은 그 **실제 키**를 쓴다. 즉 `media/<sourceId>.mp4` 도 `media/<clip.id>.mp4` 도 유효하고, 검증과 회수 둘 다 같은 우선순위로 판단한다. 새 번들을 손으로 만들 때는 위 안전 패턴(전부 sourceId)만 지키면 되고, `pull` 로 회수한 번들에는 인페인트한 클립처럼 `clip.id` 로 이름 붙은 파일이 섞여 나올 수 있다 — 정상이다.

`sourceUrl` 은 비워 둔다(`""`). 로드할 때 앱이 blob 에서 새로 만든다. 단 `data:` URL 은 자기 완결적 내용이라 그대로 쓰이고, 그 클립은 별도 미디어 파일이 필요 없다.

### 최소 예시 — 비디오 1클립 + BGM + SFX

비디오 트랙 하나와 오디오 트랙 둘. BGM 은 0초부터 6초, SFX 는 2.5초에 1초.

```json
{
  "id": "demo-trailer-001",
  "name": "Bridge Demo Trailer",
  "project": {
    "id": "demo-trailer-001",
    "name": "Bridge Demo Trailer",
    "canvasSize": { "width": 1280, "height": 720 },
    "frameRate": 30,
    "duration": 6,
    "tracks": [
      { "id": "track-v1", "name": "V1", "type": "video", "zIndex": 1, "visible": true, "locked": false, "muted": false, "height": 45 },
      { "id": "track-a1", "name": "BGM", "type": "audio", "zIndex": 0, "visible": true, "locked": false, "muted": false, "height": 45 },
      { "id": "track-a2", "name": "SFX", "type": "audio", "zIndex": 0, "visible": true, "locked": false, "muted": false, "height": 45 }
    ],
    "clips": [
      {
        "id": "clip-video-1", "name": "Opening", "type": "video", "trackId": "track-v1",
        "startTime": 0, "duration": 4, "trimIn": 0, "trimOut": 4, "playbackSpeed": 1,
        "opacity": 100, "visible": true, "locked": false,
        "position": { "x": 0, "y": 0 }, "scale": 1, "scaleX": 1, "scaleY": 1, "rotation": 0,
        "sourceUrl": "", "sourceId": "src-clip-a", "sourceDuration": 4,
        "sourceSize": { "width": 640, "height": 360 },
        "hasAudio": false, "audioMuted": true, "audioVolume": 100
      },
      {
        "id": "clip-bgm-1", "name": "BGM", "type": "audio", "trackId": "track-a1",
        "startTime": 0, "duration": 6, "trimIn": 0, "trimOut": 6, "playbackSpeed": 1,
        "opacity": 100, "visible": true, "locked": false,
        "position": { "x": 0, "y": 0 }, "scale": 1, "scaleX": 1, "scaleY": 1, "rotation": 0,
        "sourceUrl": "", "sourceId": "src-bgm", "sourceDuration": 6,
        "sourceSize": { "width": 0, "height": 0 },
        "audioMuted": false, "audioVolume": 45
      },
      {
        "id": "clip-sfx-1", "name": "SFX hit", "type": "audio", "trackId": "track-a2",
        "startTime": 2.5, "duration": 1, "trimIn": 0, "trimOut": 1, "playbackSpeed": 1,
        "opacity": 100, "visible": true, "locked": false,
        "position": { "x": 0, "y": 0 }, "scale": 1, "scaleX": 1, "scaleY": 1, "rotation": 0,
        "sourceUrl": "", "sourceId": "src-sfx", "sourceDuration": 1,
        "sourceSize": { "width": 0, "height": 0 },
        "audioMuted": false, "audioVolume": 90
      }
    ],
    "masks": [],
    "assets": [
      { "id": "src-clip-a", "name": "src-clip-a.mp4", "type": "video", "url": "", "size": { "width": 640, "height": 360 }, "duration": 4, "mediaType": "video/mp4" },
      { "id": "src-bgm", "name": "src-bgm.mp3", "type": "audio", "url": "", "size": { "width": 0, "height": 0 }, "duration": 6, "mediaType": "audio/mpeg" },
      { "id": "src-sfx", "name": "src-sfx.mp3", "type": "audio", "url": "", "size": { "width": 0, "height": 0 }, "duration": 1, "mediaType": "audio/mpeg" }
    ]
  },
  "timelineView": { "zoom": 100, "scrollX": 0, "scrollY": 0, "snapEnabled": true, "snapToFrames": false, "snapToClips": true },
  "currentTime": 0,
  "savedAt": 1786000000000
}
```

그 옆에 `media/src-clip-a.mp4`, `media/src-bgm.mp3`, `media/src-sfx.mp3` 를 두면 완성이다.

## 회수(pull)의 두 소스

기본은 **라이브 편집 상태**다. 앱의 autosave 레코드에서 읽으므로 사용자가 저장 버튼을 누르지 않아도 회수된다. autosave 는 1초 디바운스이고 클립이 하나라도 있을 때만 돌기 때문에, 빈 프로젝트는 회수할 상태가 없다고 실패한다.

`--project <id>` 를 주면 저장된 프로젝트 레코드에서 뽑는다. 두 소스는 서로 다른 사실이라 자동으로 갈아타지 않는다. 어느 쪽을 읽었는지는 출력의 `source=autosave|project` 로 찍힌다.

출력 경로 형태가 무엇을 쓸지 정한다.

- `pull ./out` (디렉토리) — `bundle.json` + `project.json` + `media/` 전체 번들
- `pull ./out.json` (`.json` 로 끝나면) — `project.json` 하나만. 미디어는 안 쓰고 몇 개를 건너뛰었는지 찍는다.

회수된 `project.json` 의 `sourceUrl` 은 비워져 나온다. 세션 안에서만 유효한 `blob:` 핸들이라 번들에 넣으면 죽은 값이기 때문이다.

어떤 클립이 자기 blob 키 어느 쪽으로도 바이트를 못 찾으면 `pull` 은 **아무것도 쓰지 않고 그 클립 목록과 후보 키를 찍으며 실패한다**. 반쪽 번들은 완전해 보이면서 재주입 때만 터지므로, 주입 방향과 같은 규칙을 적용한다.

## 구현 위치

| 무엇 | 어디 |
|---|---|
| 포맷 정의·검증·식별자 매핑 (SSoT) | `domains/video/utils/videoBundle.ts` |
| 앱 안의 브리지 (`window.__artkitVideoBridge`) | `domains/video/hooks/useAgentBridge.ts` |
| 로드된 프로젝트를 라이브 에디터에 적용 | `domains/video/hooks/useVideoProjectLibrary.ts` (`applyLoadedProject`) |
| CLI | `scripts/artkit-video-bundle.mjs` |

CLI 는 `project.json` 을 파싱하지 않는다. 파일을 읽어 브리지에 그대로 넘기고 판단은 앱 안의 포맷 모듈이 한다 — 노드와 브라우저 두 곳에 파서를 두면 스키마가 갈라지기 때문이다.

주입은 앱의 기존 경로를 그대로 쓴다: `saveMediaBlob` → `saveVideoProject` → `applyLoadedProject`. 회수는 `loadVideoAutosave` / `getVideoProject` + `loadMediaBlobForClip` 이다.

회수의 blob 키 해석은 처음에 `sourceId` 만 봐서 틀렸다(2026-08-08 검증 기각). 인페인트한 클립은 결과가 `clip.id` 에 저장되는데 회수가 `sourceId` 를 집어서 **인페인트 이전 바이트**를 경고 없이 담아 나왔고, 프레임 캡처 클립은 회수 자체가 죽었다. 수리는 우선순위를 브리지에 베껴 넣는 대신 `mediaStorage` 로 끌어올려 `loadMediaBlobForClip` 하나가 소유하게 했다 — 그 전에도 같은 `[clip.id, clip.sourceId]` 리터럴이 앱 안 네 곳에 흩어져 있었고, 이제 그 네 곳까지 같은 함수를 부른다.

브리지는 기본적으로 dev 에서만 `window` 에 올라간다(`NODE_ENV !== "production"`). 로컬 프로덕션 빌드에서 쓰려면 `NEXT_PUBLIC_ARTKIT_AGENT_BRIDGE=1` 로 명시적으로 켠다.

정확히 말하면 **프로덕션 번들에서 브리지 코드가 사라지는 것은 아니다** — 실측 결과 문자열과 함수 바이트는 청크에 남는다. 보장되는 것은 그 코드가 실행되지 않는다는 쪽이고, 그건 실제 `next build` 산출물을 정적 서빙해서 확인했다: `/video` 가 정상 렌더되는 상태에서 `window.__artkitVideoBridge` 는 `undefined` 다. 즉 배포본에서 이 경로로 스토리지에 닿을 수 없다.

## 운용 주의 (실측 2026-08-08)

**CDP 포트가 살아 있다는 것은 신원이 아니다.** 협업 창은 자기 포트와 일회용 토큰을 프로필 안(`.artkit-cdp.json`)에 기록하고, 붙는 쪽은 그 토큰을 가진 페이지가 있는지 확인한다. 이 검사가 없을 때 실제로 두 번 새어나갔다 — 남아 있던 다른 브라우저가 그 포트에 응답해서 push 하나를 그대로 삼켰고, 포트가 이미 점유된 상태에서는 새 Chrome 이 `[::1]` 에 붙고 남의 것이 `127.0.0.1` 을 쥐고 있어 **둘 다 응답**했다. 지금은 그 상황에서 조용히 붙지 않고 거부한다.

**CDP 로 붙은 브라우저에 `browser.close()` 는 연결만 끊는다.** 사용자의 창이 죽지 않는다는 뜻이라 live 모드에 필요한 성질이고, 반대로 그것으로 프로필 잠금을 풀 수는 없다.

**프로필이 잠긴 채로 두 번째 실행은 `ProcessSingleton` 실패로 나타난다.** 이것이 협업 창 없이 offline 모드를 쓸 수 없는지 판정하는 신호다.

**`npm run video:open` 은 터미널을 점유한다.** 그 프로세스가 브라우저의 부모라서 종료하면 창도 닫힌다.

## 왕복 실측 로그

```
$ node scripts/artkit-video-bundle.mjs push ./bundle-demo
[bridge] bundle=.../bundle-demo media=3개 89.1KB
[bridge] mode=live cdp=9345 (협업 창에 붙었다 — 사용자가 보고 있는 그 세션이다)
[bridge] pushed "Bridge Demo Trailer" id=demo-trailer-001 — tracks v1/a2, clips v1/a2/i0, 6.00s @30fps
[bridge] verified: 라이브 에디터가 clips 3개로 이 프로젝트를 열고 있다

# 사용자가 협업 창에서 Opening 클립을 오른쪽으로 드래그 (startTime 0 → 1.5)

$ node scripts/artkit-video-bundle.mjs pull ./pulled
[bridge] mode=live cdp=9345
[bridge] source=autosave project="Bridge Demo Trailer" id=demo-trailer-001
[bridge] wrote bundle ./pulled

$ # pulled/project.json → Opening.startTime = 1.5, media 3개 sha256 원본과 동일
```
