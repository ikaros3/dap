# DAP 문제은행

DAP(데이터아키텍처 준전문가) 대비 문제풀이 웹앱. 별도 서버 없이 브라우저에서만 동작하는 정적 페이지다.

## 사용

- 배포본: https://ikaros3.github.io/dap/
- 로컬: 이 폴더의 `index.html` 을 브라우저로 열면 된다.

## 구조

```
index.html      앱 본체 (HTML + CSS + JS 단일 파일)
data/           문제은행 데이터. 자세한 내용은 data/README.md 참고
```

## 진도 저장

풀이 진도는 브라우저 `localStorage` 에 자동 저장된다.
설정 화면의 **진도 저장** 버튼을 누르면 `dap-progress.json` 파일로 내보낼 수 있고,
**진도 파일 불러오기** 로 되돌릴 수 있다.

Chrome/Edge 에서 HTTPS 로 접속한 경우(위 배포본 주소) 처음 한 번 저장 위치를 지정하면
이후에는 같은 파일에 바로 덮어쓴다. File System Access API 를 지원하지 않는
브라우저(Firefox/Safari, 모바일)에서는 매번 다운로드 폴더에 저장된다.
