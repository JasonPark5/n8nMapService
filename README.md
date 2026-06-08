# 음성 길찾기 서비스 🗺️

음성으로 목적지를 말하면 네이버지도 앱으로 길찾기를 연결해주는 서비스입니다.

## 아키텍처

```
브라우저 음성 입력 (Web Speech API)
        ↓
  텍스트 → n8n Webhook
        ↓
  Claude API (목적지/교통수단 추출)
        ↓
  Naver 지역검색 API (후보 5곳)
        ↓
  거리순 정렬 → 프론트엔드 반환
        ↓
  사용자 선택 → 네이버지도 앱 딥링크
```

## 필요한 것들

| 항목 | 용도 | 플랫폼 |
|------|------|--------|
| **Naver Search API** | 장소명으로 후보 검색 | [developers.naver.com](https://developers.naver.com) |
| **NCP Maps API** | Geocoding (주소↔좌표, 옵션) | [console.ncloud.com](https://console.ncloud.com) |
| **Claude API Key** | 한국어 NLP (목적지 파싱) | [console.anthropic.com](https://console.anthropic.com) |
| **n8n** | 워크플로우 오케스트레이션 | 본인 n8n 인스턴스 |
| **GitHub** | 프론트엔드 호스팅 (Pages) | GitHub |

---

## Step 1. API 키 발급

### 1-1. Naver 검색 API (장소 검색용)
> ⚠️ NCP(maps.ncloud.com)가 아닌 **별도 Naver Developers 플랫폼**입니다.

1. [developers.naver.com](https://developers.naver.com) 접속 → 로그인
2. **내 애플리케이션 → 애플리케이션 등록**
3. API 선택: **검색** 체크 (지역검색 포함)
4. 등록 후 **Client ID**와 **Client Secret** 복사

### 1-2. NCP Maps API (Geocoding, 향후 확장용)
> 현재 프로젝트에서 필수는 아니지만, 주소↔좌표 변환에 활용 가능합니다.

1. [console.ncloud.com](https://console.ncloud.com) 접속 → AI·NAVER API → Maps → Application
2. **Application 등록** → **Geocoding** 체크
3. Client ID / Client Secret 복사

### 1-3. Claude API Key
1. [console.anthropic.com](https://console.anthropic.com) 접속
2. API Keys → **Create Key**
3. 키 복사 (`sk-ant-...`)

---

## Step 2. n8n 워크플로우 Import

1. n8n 접속 → **Workflows → Import from File**
2. 이 저장소의 `n8n-workflow.json` 선택
3. 워크플로우가 열리면 아래 Credential 설정 진행

---

## Step 3. n8n Credential 설정

### Claude API Credential
- n8n → **Credentials → New** → **Header Auth** 선택
- Name: `Claude API`
- Name 필드: `x-api-key`
- Value 필드: `sk-ant-...` (발급받은 Claude API Key)

### Naver Search API Credential
- n8n → **Credentials → New** → **Basic Auth** 선택
- Name: `Naver Search API`
- Username: Naver Client ID
- Password: Naver Client Secret

---

## Step 4. 워크플로우 활성화

1. 워크플로우 우상단 **Active** 토글 켜기
2. Webhook 노드 클릭 → **Webhook URL 복사**
   - 예: `https://your-n8n.app.n8n.cloud/webhook/map-search`

---

## Step 5. 프론트엔드에 Webhook URL 연결

`index.html`을 브라우저에서 열거나 GitHub Pages로 배포 후:

1. 우상단 **⚙️ 설정** 버튼 클릭
2. 복사한 Webhook URL 붙여넣기
3. **저장** → localStorage에 저장됨 (새로고침 후에도 유지)

---

## Step 6. GitHub Pages 배포

```bash
git push origin main
```

배포 후 URL: `https://<github-username>.github.io/<repo-name>/`

Settings → Pages → Source를 **gh-pages** 브랜치로 설정하세요.

---

## 사용 방법

1. 🎤 **마이크 버튼** 클릭 → 목적지 말하기
   - 예: "대중교통으로 강남역 가기"
   - 예: "자동차로 인천공항 가는 길"
2. 후보 장소 카드 중 **길찾기 →** 버튼 클릭
   - 모바일: 네이버지도 앱 자동 실행 (미설치 시 웹으로 열림)
   - PC: 네이버지도 웹으로 열림
3. ☆ 버튼으로 **즐겨찾기** 저장 → ⭐ 탭에서 바로 길찾기

---

## 주요 기능

- 🎤 Web Speech API 음성 인식 (ko-KR)
- 🤖 Claude Haiku로 자연어 목적지 파싱 (regex fallback 포함)
- 📍 현재 위치 기반 거리순 정렬
- ⭐ 즐겨찾기 저장/관리 (localStorage)
- 🚇/🚗 대중교통/자동차 모드 전환
- 📱 네이버지도 앱 딥링크 (`nmap://`) + 웹 fallback
- ⌨️ 텍스트 직접 입력 fallback

## n8n 워크플로우 구성

```
Webhook → 입력 준비 → Claude NLP → 목적지 파싱 → 네이버 지역검색 → 결과 포맷 → Webhook 응답
```

- **Claude NLP**: `claude-haiku-4-5-20251001` 모델로 저비용 처리
- **Naver 지역검색**: `openapi.naver.com/v1/search/local.json`
- **거리 계산**: Haversine 공식으로 서버사이드 계산 후 거리순 정렬
