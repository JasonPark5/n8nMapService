# 음성 길찾기 서비스

말로 목적지를 말하면 네이버지도 앱으로 길을 안내해주는 웹 챗봇 서비스입니다.

## 프로젝트 소개

스마트폰 브라우저에서 마이크 버튼을 누르고 "강남역 가는 길"처럼 말하면:
1. 음성을 텍스트로 변환 (Web Speech API)
2. n8n 워크플로우가 네이버 지역 검색 API로 후보 장소 최대 5개 검색
3. 카드 형태로 후보지 표시
4. 선택하면 네이버지도 앱으로 자동 전환하여 길찾기 시작

## 필요한 것들

- **네이버 클라우드 플랫폼 API 키** (Search API - Local Search)
- **n8n** (셀프호스팅 또는 n8n.cloud)
- **GitHub 계정** (GitHub Pages 배포용)

## 아키텍처

```
[사용자 스마트폰]
      |
      | 1. 음성 입력 (Web Speech API)
      v
[GitHub Pages - index.html]
      |
      | 2. POST /webhook/map-search
      |    { text, lat, lng, transportMode }
      v
[n8n 워크플로우]
      |
      | 3. 목적지 추출 (Korean NLP regex)
      v
[네이버 지역 검색 API]
      |
      | 4. 검색 결과 (최대 5개)
      v
[n8n - 좌표 변환 & 포맷]
      |
      | 5. JSON 응답
      v
[GitHub Pages - 카드 표시]
      |
      | 6. 장소 선택
      v
[네이버지도 앱 딥링크]
   nmap://route/public?...
```

---

## 단계별 설치 방법

### 1단계: 네이버 클라우드 API 키 발급

1. [네이버 개발자 센터](https://developers.naver.com/) 접속
2. **내 애플리케이션 > 애플리케이션 등록** 클릭
3. 애플리케이션 이름 입력 (예: `음성길찾기`)
4. **사용 API** 에서 **검색 > 지역** 선택
5. 환경 추가: **WEB 설정** - 서비스 URL에 GitHub Pages URL 입력
   - 예: `https://YOUR_USERNAME.github.io`
6. 등록 후 **Client ID**와 **Client Secret** 확인 및 복사

### 2단계: n8n 워크플로우 가져오기

1. n8n 대시보드 접속 (`http://localhost:5678` 또는 n8n.cloud)
2. 왼쪽 메뉴 **Workflows** 클릭
3. 우측 상단 **...** 메뉴 > **Import from file** 클릭
4. `n8n-workflow.json` 파일 선택하여 가져오기
5. 워크플로우가 로드되면 **Save** 클릭

### 3단계: n8n Credential 설정 (Naver API 키)

1. n8n 대시보드 좌측 메뉴 **Credentials** 클릭
2. **Add Credential** 클릭
3. **HTTP Header Auth** 검색 후 선택
4. 다음과 같이 입력:
   - **Name**: `Naver API`
   - **Name (Header)**: `X-Naver-Client-Id`
   - **Value**: 발급받은 Client ID 붙여넣기
5. **Save** 클릭

> **주의**: Client Secret도 별도로 설정해야 합니다.
> 워크플로우의 "네이버 지역 검색" 노드를 열고 Header Parameters에서
> `X-Naver-Client-Secret` 값을 직접 입력하거나 별도 Credential로 관리하세요.

**권장 방법 (환경변수 사용):**

n8n 워크플로우의 "네이버 지역 검색" HTTP Request 노드를 열어서:
- Header: `X-Naver-Client-Id` = `{{ $env.NAVER_CLIENT_ID }}`
- Header: `X-Naver-Client-Secret` = `{{ $env.NAVER_CLIENT_SECRET }}`

n8n 실행 환경에 환경변수 추가:
```bash
NAVER_CLIENT_ID=your_client_id_here
NAVER_CLIENT_SECRET=your_client_secret_here
```

### 4단계: Webhook URL을 index.html에 설정

#### 방법 A: 설정 UI 사용 (런타임)
1. GitHub Pages에서 배포된 페이지 접속
2. 우측 상단 **설정** 버튼 클릭
3. n8n Webhook URL 입력
   - 형식: `https://your-n8n-domain.com/webhook/map-search`
4. **저장** 클릭 (localStorage에 저장됨)

#### 방법 B: 코드에 직접 설정 (빌드타임)
`index.html` 파일을 열어서 상단 CONFIG 부분 수정:

```javascript
const CONFIG = {
  webhookUrl: 'https://your-n8n-domain.com/webhook/map-search',
};
```

#### n8n Webhook URL 확인 방법:
1. n8n 워크플로우에서 **Webhook** 노드 클릭
2. **Webhook URL** 복사
3. 워크플로우를 **Active** 상태로 설정 (토글 ON)

### 5단계: GitHub Pages 배포

#### 저장소 설정:
1. GitHub에서 이 저장소의 **Settings** 탭 클릭
2. 왼쪽 메뉴 **Pages** 클릭
3. **Source**: `Deploy from a branch` 선택
4. **Branch**: `gh-pages` 선택, 폴더 `/ (root)` 선택
5. **Save** 클릭

#### 자동 배포 (GitHub Actions):
`.github/workflows/deploy.yml`이 포함되어 있어 `main` 브랜치에 push하면 자동으로 GitHub Pages에 배포됩니다.

```bash
git add .
git commit -m "feat: 음성 길찾기 서비스"
git push origin main
```

배포 완료 후 접속 URL: `https://YOUR_USERNAME.github.io/REPO_NAME/`

---

## 사용 방법

1. 스마트폰 브라우저에서 GitHub Pages URL 접속
2. 위치 권한 허용 (길찾기 시 현재 위치 사용)
3. 교통수단 선택: **대중교통** 또는 **자동차**
4. 마이크 버튼 누르기
5. 목적지 말하기:
   - "강남역 가는 길"
   - "경복궁으로 가기"
   - "스타벅스 찾아줘"
   - "홍대입구역까지 대중교통으로"
6. 검색된 후보지 중 원하는 장소의 **길찾기** 버튼 클릭
7. 네이버지도 앱이 자동으로 열리며 길찾기 시작

---

## 지원 음성 명령 패턴

| 패턴 | 예시 |
|------|------|
| `[목적지] 가는 길` | "강남역 가는 길" |
| `[목적지](으로/로) 가기` | "경복궁으로 가기" |
| `[목적지](에/까지) 가기` | "홍대입구역까지 가기" |
| `[목적지] 찾아줘/알려줘` | "스타벅스 찾아줘" |
| `[목적지] 어떻게 가` | "코엑스 어떻게 가" |

---

## 문제 해결

### 마이크가 작동하지 않아요
- HTTPS 환경에서만 Web Speech API가 동작합니다 (GitHub Pages는 HTTPS 제공)
- 브라우저에서 마이크 권한을 허용해주세요
- Chrome/Edge 브라우저 사용 권장 (Safari는 일부 제한)

### 검색 결과가 없어요
- n8n 워크플로우가 **Active** 상태인지 확인
- Naver API 키가 올바른지 확인
- n8n 실행 로그에서 오류 메시지 확인

### 네이버지도 앱이 안 열려요
- 스마트폰에 네이버지도 앱이 설치되어 있어야 합니다
- 앱이 없으면 자동으로 웹 버전으로 연결됩니다
- PC에서는 항상 웹 버전으로 열립니다

### CORS 오류
- n8n Webhook 노드의 **Allowed Origins** 설정에서 GitHub Pages URL 허용
- 또는 `*` (모든 도메인 허용)으로 설정

---

## 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Voice**: Web Speech API (SpeechRecognition)
- **Location**: Geolocation API
- **Workflow**: n8n (No-code automation)
- **Search API**: Naver Local Search API v1
- **Navigation**: Naver Maps App Deeplink (nmap://)
- **Hosting**: GitHub Pages