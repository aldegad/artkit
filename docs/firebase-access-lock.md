# 클라우드 접근 잠금 (허용 uid 목록)

Firestore·Storage 접근을 허용 목록에 있는 Firebase uid 로만 제한한다. 목록에 없는 계정은 로그인에 성공해도 자기 공간을 포함해 어떤 경로도 읽거나 쓰지 못한다.

## 왜 잠갔나

예전 규칙은 `request.auth != null && request.auth.uid == userId` 뿐이라 인증만 되면 누구나 자기 uid 공간을 썼다. 앱 로그인은 Google 팝업 하나로 열려 있으므로 임의의 구글 계정이 곧 쓰기 권한이었고, 그 쓰기가 그대로 Storage 바이트와 대역폭 요금이 된다. 트레일러 프로젝트 하나가 미디어 15MB다.

실사용은 로컬(익명 IndexedDB)이 기본이고 클라우드는 백업·기기이동 용도다. 그래서 비용 축은 로그인 횟수가 아니라 저장 바이트이고, 막아야 할 것은 로그인이 아니라 데이터 접근이다.

로그인 자체를 막는 blocking function(`beforeUserSignedIn`)은 [공식 문서](https://firebase.google.com/docs/auth/extend-with-blocking-functions)상 Identity Platform 업그레이드가 전제다. 비용을 줄이려는 작업에 유료 등급과 Cloud Functions 를 물리는 것은 목적과 반대라 채택하지 않았다.

## 어디를 고치나

허용 목록의 정의처는 `firebase/allowed-uids.json` **하나**다.

Firebase 보안 규칙에는 include·import 가 없어서 `firestore.rules` 와 `storage.rules` 는 물리적으로 분리된 파일이다. 양쪽에 uid 를 손으로 적으면 진실이 둘이 되고, 한쪽만 고치는 순간 한 저장소가 열린 채 남는다. 그래서 두 파일의 `BEGIN generated: allowed-uids` 블록은 생성기가 렌더하고, 손편집은 테스트가 거부한다.

```bash
# firebase/allowed-uids.json 의 allowedUids 배열에 uid 를 넣은 뒤
npm run rules:build     # 두 rules 파일의 generated 블록을 다시 렌더한다
npm run rules:check     # 갈라졌는지만 판정한다 (npm test 가 같은 검사를 포함한다)
```

허용할 uid 는 Firebase 콘솔에서 확인한다: 프로젝트 `tools-b1c33` > Authentication > Users > User UID 열.

빈 목록은 전원 거부다. 렌더된 `uid in []` 이 항상 거짓이기 때문이고, 자리표시자 uid 를 넣지 않는 이유가 이것이다 — 자리표시자는 "누군가 허용됨"으로 읽힌다.

## 검증

```bash
npm test                # 허용 목록 SSoT 와 두 rules 파일의 drift 검사
npm run test:rules      # firestore·storage 에뮬레이터로 규칙을 실제 평가
```

`npm run test:rules` 는 (a) 허용 uid 의 자기 공간 읽기·쓰기 통과 (b) 비허용 uid 의 자기 공간 거부 (c) 미인증 거부 (d) 허용 uid 라도 남의 공간 거부 (e) 빈 목록이면 인증된 uid 도 거부 를 Firestore·Storage 양쪽에서 고정한다. 에뮬레이터는 JRE 가 필요하다.

(a)~(e) 중 구조를 보는 절들은 허용 목록만 합성 값으로 갈아끼워 돌기 때문에, 커밋된 목록에 누가 들어 있든 게이트가 성립하는지 확인된다. 별도로 rules 파일을 그대로 올려 커밋된 목록의 실제 uid 가 통과하는지도 잰다 — 배포될 산출물 자체에 대한 검사다.

## 배포

규칙 배포와 호스팅 배포는 다른 커맨드다. 이름이 갈라져 있으므로 "배포"가 무엇을 올리는지 커맨드가 말해 준다.

```bash
npm run deploy         # 호스팅만 올린다 (firebase deploy --only hosting)
npm run deploy:rules   # 보안 규칙만 올린다 (rules:check 통과 후 firebase deploy --only firestore:rules,storage)
```

`deploy:rules` 는 `rules:check` 를 먼저 돌린다. 렌더된 `.rules` 가 `firebase/allowed-uids.json` 과 어긋나 있으면 거기서 멈추고 firebase 를 부르지 않는다 — 손으로 고친 규칙이 SSoT 를 앞질러 배포되는 경로를 닫는다.

프로젝트는 `.firebaserc` 의 default(`tools-b1c33`)에서 온다. 어느 프로젝트로 나가는지의 정의처는 그 파일 하나이므로 스크립트에 프로젝트 id 를 박지 않는다.

### `npm run deploy:rules` 를 누르기 전에

이 커맨드는 **라이브 보안 규칙을 교체한다.** 사용자 자산에 닿고 되돌리기 어려우므로 사람이 직접 실행한다.

드리프트는 `rules:check` 가 막지만 **빈 목록은 막지 않는다** — 빈 채로 렌더된 규칙은 SSoT 와 일치하기 때문이다. 그건 사람이 본다. 허용 목록이 비어 있지 않은지 먼저 확인한다:

```bash
grep -A4 'function isAllowedOwner' firestore.rules storage.rules
```

빈 목록(`uid in []`)인 채로 배포하면 사용자 본인도 자기 클라우드 데이터를 읽지 못한다. 그리고 되돌리는 경로도 이 커맨드다 — 목록을 채우고 다시 배포하는 것 말고 다른 길이 없다.

### 잠겼을 때 — 콘솔에서 손으로 고치지 마라

잠금은 영구적이지 않다. 규칙 배포는 관리 API 와 프로젝트 IAM 권한으로 나가고 [규칙 자신은 그 배포를 막지 못한다](https://firebase.google.com/docs/rules/manage-deploy). 즉 전원이 거부되는 규칙이 라이브여도 배포 권한은 그대로이므로, `firebase/allowed-uids.json` 에 uid 를 넣고 `npm run deploy:rules` 를 다시 돌리면 복구된다. 최악은 일시적 접근 차단이지 회복 불가가 아니다.

그러니 급한 마음에 Firebase 콘솔에서 규칙을 손으로 고치지 마라. 두 가지가 동시에 깨진다 — 허용 목록의 정의처가 둘이 되고, 그 손편집은 **다음 `deploy:rules` 가 조용히 덮어쓴다**(CLI 배포는 콘솔의 기존 규칙을 덮어쓴다). 복구도 SSoT 를 거쳐서 한다.

### 왜 나눴나

예전에는 `npm run deploy` 가 `firebase deploy` 를 타겟 없이 불렀다. `firebase.json` 에 규칙이 설정돼 있으므로 그 한 번이 호스팅과 보안 규칙을 함께 올렸다. 호스팅을 올리려던 배포가 규칙까지 올리는 셈이고, 허용 목록이 빈 상태에서 그게 돌면 사용자가 잠긴다. 되돌리려면 다시 배포해야 하는데 그 배포도 같은 스크립트였다.

규칙 배포 경로를 아예 없애는 수리는 하지 않았다. 그러면 규칙을 올릴 정당한 경로가 레포에서 사라지고, 다음 사람이 커맨드를 손으로 타이핑하다 타겟을 다시 빼먹는다 — 그게 지금 고치려는 사고 그 자체다.
