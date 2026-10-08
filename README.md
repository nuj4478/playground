# 박스오피스 + 광고 (Lambda 연습)

Lambda 함수 **하나**(`boxoffice`)에 경로 두 개를 둔 API 와, 그걸 쓰는 웹 화면이에요.

```
web ──GET /movies?date=──▶ ┐                  ┌─▶ movies/handler.mjs ──키 붙여서──▶ KOBIS API
web ──GET /ads───────────▶ ├─ api/index.mjs ──┤
web ──PUT /ads + 토큰─────▶ ┘  (경로 보고 분기)  └─▶ ads/handler.mjs ──읽기/덮어쓰기──▶ S3 ads/config.json
```

## 폴더 구조

```
api/                     ← AWS Lambda 함수 boxoffice 에 올라가는 코드
├── index.mjs            경로 분기만 함 (/movies, /ads)
├── movies/handler.mjs   KOBIS 박스오피스 (키 숨기기, 필드 정리, 새벽 대체)
├── ads/handler.mjs      광고 저장·순서·기간 (S3 에 JSON 파일 하나: ads/config.json)
├── local-server.mjs     로컬용 Function URL (localhost:3001) — AWS 에는 안 올림
├── .env                 KOBIS_KEY, ADMIN_TOKEN (git 제외)
└── ads/.local-store/    로컬에서 S3 대신 쓰는 폴더 (git 제외)
web/                     화면 (index.html, app.js, ads.js, config.js)
```

새 기능을 붙이려면 `api/<이름>/handler.mjs` 를 만들고 `api/index.mjs` 의 `ROUTES` 에 한 줄 추가하면 돼요.

## 로컬에서 실행 (루트 폴더에서)

```bash
npm run dev        # 터미널 1: API → localhost:3001/movies , /ads
npm run web        # 터미널 2: 화면 → localhost:3000
```

- `api/` 코드를 고치면 **터미널 1 을 껐다 켜야** 반영돼요. `web/` 은 새로고침만.
- 오른쪽 위 **운영자 모드** → `api/.env` 의 `ADMIN_TOKEN` 입력 → 광고 편집·순서·기간

## 광고 규칙

- **저장** = `config.json` 을 통째로 덮어쓰기 (배열 순서 = 노출 순서). 이력은 남기지 않아요.
- **기간** `startAt` / `endAt` (`2026-12-20T09:00`, 비우면 제한 없음). 판단은 브라우저가 현재 시각으로.
- **숨김(노출 해제)** 광고는 토큰이 있어야 보여요. 토큰이 틀리면 PUT 은 401.

## 함수 하나로 쓸 때 알아둘 점

- 영화 코드와 광고 코드가 KOBIS 키·운영자 토큰·S3 권한을 같이 가져요.
- 광고 코드에서 import 에러가 나면 영화까지 같이 멈춰요. 고치면 `npm run dev` 로 먼저 확인.

## AWS 에 반영 — GitHub Actions 자동 배포

`main` 에 `api/` 변경이 머지되면 `.github/workflows/deploy-lambda.yml` 이 zip 을 만들어 기존 `boxoffice` 함수에 올려요.
(이 계정은 OIDC 가 막혀 있어서 배포 전용 IAM 사용자 키를 씀. 회사는 OIDC 방식)

### 처음 한 번만: AWS 콘솔 (시드니 ap-southeast-2)

1. **S3 버킷** 생성: 예 `boxoffice-ads-<숫자>`, **퍼블릭 액세스 차단 켠 채로**
2. **`boxoffice` 함수 환경 변수 추가** (`KOBIS_KEY` 는 이미 있음): `ADMIN_TOKEN` (`openssl rand -hex 16`), `ADS_BUCKET` = 버킷 이름
3. **`boxoffice` 함수의 S3 권한** (구성 → 권한 → 실행 역할 → 인라인 정책 JSON, `버킷이름` 바꾸기)
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
         "Resource": "arn:aws:s3:::버킷이름/ads/*" },
       { "Effect": "Allow", "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::버킷이름" }
     ]
   }
   ```
   `ListBucket` 은 아직 저장 전일 때 S3 가 "파일 없음"(정상 처리)이라고 답하게 하려고 필요해요. 없으면 AccessDenied 로 첫 GET 이 500 이 돼요.
4. **함수 URL CORS 수정**: 메서드 `GET, PUT`, 헤더 `content-type, authorization` (주소는 그대로)
5. **배포 전용 IAM 사용자** `github-deploy-boxoffice` 생성 (IAM → 사용자 → 사용자 생성, 콘솔 접근 없이)
   인라인 정책 (이 함수 코드만 바꿀 수 있음):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
       "Resource": "arn:aws:lambda:ap-southeast-2:136282784202:function:boxoffice"
     }]
   }
   ```
   → 보안 자격 증명 탭 → 액세스 키 만들기 → "AWS 외부에서 실행되는 애플리케이션" → 키 두 개 복사 (다시 못 봄)

### 처음 한 번만: GitHub

1. 빈 레포 만들기 (README 추가하지 않기)
2. Settings → Secrets and variables → Actions
   - **Secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - **Variables** (선택): `FUNCTION_URL` = 함수 URL (끝에 `/` 없이) → 배포 후 `/ads` 로 확인
3. 로컬에서 푸시
   ```bash
   git init && git add . && git status    # .env, .local-store, *.zip 이 목록에 없는지 확인!
   git commit -m "박스오피스 + 광고 Lambda"
   git branch -M main
   git remote add origin https://github.com/<아이디>/<레포>.git
   git push -u origin main
   ```
4. Actions 탭에서 배포가 초록색인지 확인 → `web/config.js` 의 `API_BASE` 를 AWS 줄로

### 그다음부터

브랜치에서 작업 → PR → main 에 머지 → 자동 배포. 급하면 Actions 탭 → Run workflow 로 수동 배포.

주의: 새 코드가 처음 올라가는 순간 영화 주소가 `/` 에서 `/movies` 로 바뀌어요. `config.js` 도 같이 바꿔야 화면이 안 끊겨요.

## 디버깅

- Lambda → 모니터링 → CloudWatch 로그 (`알 수 없는 경로` 경고로 경로 오타 확인)
- 브라우저 콘솔에 CORS 에러 → 함수 URL 의 CORS 설정 (PUT, authorization)
