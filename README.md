# 손끝 모바일 드로잉 PWA

펜·연필·마커·붓·형광펜·스프레이·지우개 7종, 색상·굵기·농도 조절, 화면 맞춤과 버튼/휠/두 손가락 확대·축소를 제공한다. `새 그림`은 별도 프로젝트로 1080×1080 정사각형 작업을 만들며 이전 작업은 `손끝` 버튼의 작업 목록에서 다시 열 수 있다.

## 주요 기능

- 로컬 파일 선택, PC 드래그 앤 드롭, 클립보드 붙여넣기, 이미지 URL, 웹 이미지 검색 후 붙여넣기로 사진을 배경에 배치
- 맞춤/채우기와 90도 회전, IndexedDB 자동 저장 및 재실행 복구
- Android 설치 앱의 이미지 공유 대상 지원. iOS는 사진 선택·파일 선택·클립보드 경로 지원
- PNG/JPEG 크기·품질 선택 내보내기와 Web Share, `.fingertip` 원본 파일 백업/복원
- 최근 작업 목록과 프로젝트 복제·삭제, 최대 8개의 제한 레이어
- 세로/가로 모바일 안전 영역과 각 도구 패널의 독립 가로 스크롤

인터넷 이미지의 URL 직접 가져오기는 해당 사이트가 브라우저 CORS 접근을 허용할 때만 가능하다. 차단되는 이미지는 검색 결과에서 복사한 뒤 앱의 `클립보드 붙여넣기`를 사용한다.

## 실행 방법

Windows에서는 프로젝트 루트의 `server.bat`를 더블클릭한다. 메뉴에서 서버 시작·종료·재시작·상태 확인을 선택할 수 있다. `start-app.cmd`는 서버를 시작하고 브라우저를 여는 단축 실행 파일이다.

터미널에서 직접 제어하려면 다음과 같이 실행한다.

```text
server.bat start
server.bat stop
server.bat restart
server.bat status
```

서버 PID는 `.fingertip-server.pid`, 실행 로그는 `.fingertip-server.log`에 기록된다. 종료할 때는 PID 파일에 기록된 이 프로젝트의 Vite 프로세스만 종료한다.

터미널에서는 다음과 같이 실행할 수 있다.

```text
pnpm install
pnpm dev
```

`index.html`을 직접 더블클릭한 `file://` 주소에서는 브라우저 보안 정책 때문에 TypeScript 모듈, IndexedDB/PWA 범위와 서비스 워커가 정상 동작하지 않는다. 반드시 위 로컬 서버 방식으로 연다.

## 검증

```text
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:e2e
pnpm run build
```
