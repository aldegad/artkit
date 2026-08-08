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

`npm run test:rules` 는 규칙을 합성 uid 로 렌더해 돌린다. 그래서 사용자의 진짜 uid 없이도 (a) 허용 uid 의 자기 공간 읽기·쓰기 통과 (b) 비허용 uid 의 자기 공간 거부 (c) 미인증 거부 (d) 허용 uid 라도 남의 공간 거부 (e) 빈 목록이면 인증된 uid 도 거부 를 Firestore·Storage 양쪽에서 고정한다. 에뮬레이터는 JRE 가 필요하다.

## 배포

**배포 전에 허용 uid 를 반드시 채운다.** 빈 목록인 채로 배포하면 사용자 본인도 자기 클라우드 데이터를 읽지 못한다.

```bash
firebase deploy --only firestore:rules,storage --project tools-b1c33
```

배포는 사용자 자산에 닿고 되돌리기 어려우므로 사람이 직접 실행한다.

`npm run deploy` 는 `firebase deploy` 를 타겟 없이 부르므로 hosting 뿐 아니라 **firestore·storage 규칙까지 함께 올린다**. 허용 목록이 빈 상태에서 그 스크립트를 돌리면 잠금이 그대로 배포된다. 목록을 채우기 전에는 `npm run deploy` 를 쓰지 않는다.
