# 음성 길찾기 서비스

음성으로 목적지를 말하면 AI가 장소를 검색하고, 네이버지도 앱으로 바로 길찾기를 연결해주는 단일 파일 웹 앱입니다.

> 스크린샷 placeholder — 여기에 실제 화면 캡처를 추가하세요.

---

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   브라우저 (index.html)               │
│                                                     │
│  Web Speech API (ko-KR)                             │
│       │ 음성 → 텍스트                                │
│  Geolocation API                                    │
│       │ 현재 위치 (lat, lng)                         │
│       ↓                                             │
│  fetch POST → n8n Webhook URL                       │
│       { text, lat, lng, transportMode }             │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS POST
                    ↓
┌─────────────────────────────────────────────────────┐
│                n8n 워크플로우                         │
│                                                     │
│  [Webhook 수신]                                     │
│       ↓                                             │
│  [입력 준비 (Code 노드)]                             │
│       │ text, lat, lng, transportMode 정리           │
│       ↓                                             │
│  [Claude API (HTTP Request)]                        │
│       │ claude-haiku — 목적지·교통수단 추출           │
│       ↓                                             │
│  [목적지 파싱 (Code 노드)]                           │
│       │ JSON or regex fallback                      │
│       ↓                                             │
│  [네이버 지역검색 API (HTTP Request)]                │
│       │ openapi.naver.com/v1/search/local.json       │
│       ↓                                             │
│  [결과 포맷 (Code 노드)]                             │
│       │ Haversine 거리계산 + 정렬 + distanceLabel    │
│       ↓                                             │
│  [Webhook 응답]                                     │
│       │ { candidates[], destination, transportMode } │
└───────────────────┬─────────────────────────────────┘
                    │ JSON 응답
                    ↓
┌─────────────────────────────────────────────────────┐
│                   브라우저 (계속)                     │
│                                                     │
│  candidates 카드 렌더링                              │
│       ↓                                             │
│  사용자가 "길찾기 →" 클릭                            │
│       ↓                                             │
│  nmap:// 딥링크 시도 (모바일)                        │
│  네이버지도 웹 fallback (PC / 앱 미설치)             │
└─────────────────────────────────────────────────────┘
```

---

## 프론트엔드 구조

### 파일 구성

단일 파일 SPA입니다. `index.html` 하나에 HTML 구조, CSS, JavaScript가 모두 포함되어 있습니다. 별도의 번들러, 프레임워크, 의존성이 없으며 정적 파일 호스팅만 있으면 동작합니다.

### Web Speech API — 음성 인식 흐름

```
마이크 버튼 클릭
  → toggleRecording()
    → startRecording()
      → new SpeechRecognition()
        lang = 'ko-KR'
        interimResults = false
        maxAlternatives = 1
      → recognition.start()
      → onstart: UI 상태 변경 (버튼 빨간색, 펄스 애니메이션)
      → onresult: e.results[0][0].transcript → sendText(text)
      → onerror: 에러 토스트 표시 후 stopRecording()
      → onend: stopRecording()
```

- `SpeechRecognition` / `webkitSpeechRecognition` 모두 지원 (크롬 기준)
- 음성 인식 미지원 브라우저는 토스트 알림 후 텍스트 입력으로 유도

### Geolocation API — 현재 위치

```javascript
navigator.geolocation.getCurrentPosition(
  success → currentLocation = { lat, lng }
  error   → 서울시청 기본값 { lat: 37.5665, lng: 126.9780 }
  options → { enableHighAccuracy: true, timeout: 10000 }
)
```

위치 정보는 n8n 요청 시 `lat`, `lng` 필드로 전달되어 서버사이드 거리 계산에 사용됩니다.

### n8n Webhook 호출 방식

```javascript
fetch(CONFIG.webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text,           // 사용자 입력 텍스트 (음성 or 타이핑)
    lat,            // 현재 위치 위도
    lng,            // 현재 위치 경도
    transportMode,  // 'transit' | 'car'
  }),
})
```

Webhook URL은 `localStorage.getItem('webhookUrl')`로 읽으며, 설정 모달에서 변경할 수 있습니다.

### 응답 파싱 로직 — 배열 Unwrap

n8n은 응답을 배열로 감싸서 보낼 수 있습니다. 이를 처리하는 코드:

```javascript
var root = Array.isArray(data) ? data[0] : data;
var candidates = root.candidates || (Array.isArray(root) ? root : []);
var mode = root.transportMode || transportMode;
var dest = root.destination || '';
```

n8n의 Respond to Webhook 노드 설정에 따라 `data` 자체가 배열인 경우와 그렇지 않은 경우 모두 대응합니다.

### 네이버지도 딥링크 방식

모바일에서는 `nmap://` 앱 딥링크를 먼저 시도하고, 앱이 없거나 PC인 경우 웹 URL로 fallback합니다.

```javascript
// 앱 딥링크 (모바일)
nmap://route/public?slat=...&slng=...&dlat=...&dlng=...&dname=...&appname=...
nmap://route/car?slat=...&slng=...&dlat=...&dlng=...&dname=...&appname=...

// 웹 fallback (PC / 앱 미설치)
https://map.naver.com/v5/directions/-/{dlng},{dlat},{dname},-/transit?c=15,0,0,0,dh
https://map.naver.com/v5/directions/-/{dlng},{dlat},{dname},-/car?c=15,0,0,0,dh
```

모바일 감지는 `navigator.userAgent`로 Android / iPhone / iPad / iPod 여부를 확인합니다. 딥링크 실패 감지는 1500ms 타이머 + `window blur` 이벤트를 조합합니다.

### 즐겨찾기 — localStorage

즐겨찾기 데이터는 `localStorage.favorites`에 JSON 배열로 저장됩니다.

```json
[
  {
    "lat": 37.498,
    "lng": 127.028,
    "name": "강남역",
    "address": "서울 강남구 강남대로",
    "category": "지하철역",
    "savedAt": 1717123456789
  }
]
```

중복 체크는 위/경도 오차 0.0001도(약 11m) 이내를 동일 장소로 간주합니다.

### 설정 — localStorage

Webhook URL은 `localStorage.webhookUrl`에 저장됩니다. 앱 초기화 시 `CONFIG.webhookUrl`로 읽어 전역 상태로 유지됩니다.

---

## n8n 워크플로우 구조

### 노드 1: Webhook

| 항목 | 값 |
|------|-----|
| HTTP 메서드 | POST |
| 경로 | `/map-search` |
| 응답 방식 | Respond to Webhook 노드 사용 |

**수신 데이터:**
```json
{ "text": "강남역 가기", "lat": 37.5665, "lng": 126.9780, "transportMode": "transit" }
```

### 노드 2: 입력 준비 (Code)

Webhook 바디에서 값을 추출하고 기본값을 설정합니다.

```javascript
const body = $input.first().json.body;
return [{
  json: {
    text: body.text || '',
    lat: body.lat || 37.5665,
    lng: body.lng || 126.9780,
    transportMode: body.transportMode || 'transit',
  }
}];
```

### 노드 3: Claude API (HTTP Request)

Claude Haiku를 호출하여 한국어 자연어에서 목적지와 교통수단을 추출합니다.

| 항목 | 값 |
|------|-----|
| URL | `https://api.anthropic.com/v1/messages` |
| 메서드 | POST |
| 인증 | Header Auth (`x-api-key: sk-ant-...`) |
| 헤더 | `anthropic-version: 2023-06-01` |
| 모델 | `claude-haiku-4-5-20251001` |

**프롬프트 (요약):**
```
사용자 입력: "{text}"
교통수단 힌트: {transportMode}

목적지와 교통수단을 JSON으로 반환하세요:
{ "destination": "강남역", "transportMode": "transit" }
```

**출력 예시:**
```json
{ "destination": "강남역", "transportMode": "transit" }
```

### 노드 4: 목적지 파싱 (Code)

Claude 응답에서 JSON을 파싱합니다. JSON 파싱 실패 시 정규식으로 fallback합니다.

```javascript
const text = $input.first().json.content[0].text;
let parsed;
try {
  parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
} catch(e) {
  // regex fallback: 텍스트에서 목적지 추출
  parsed = { destination: text.trim(), transportMode: 'transit' };
}
```

**출력:** `{ destination, transportMode }`

### 노드 5: 네이버 지역검색 API (HTTP Request)

| 항목 | 값 |
|------|-----|
| URL | `https://openapi.naver.com/v1/search/local.json` |
| 메서드 | GET |
| 인증 | Basic Auth (Client ID / Client Secret) |
| 파라미터 | `query={destination}&display=5&sort=random` |

**응답 예시:**
```json
{
  "items": [
    {
      "title": "강남역",
      "address": "서울특별시 강남구 강남대로 ...",
      "category": "지하철,전철",
      "mapx": "127027832",
      "mapy": "37497952"
    }
  ]
}
```

> 네이버 검색 API의 좌표는 카텍(KATEC) 또는 NHN 포맷입니다. 실제 WGS84 좌표로 변환이 필요합니다. (현재 워크플로우에서는 `mapx / 1e7`, `mapy / 1e7` 방식으로 근사 변환)

### 노드 6: 결과 포맷 (Code)

검색 결과를 정렬하고 거리를 계산합니다.

```javascript
// Haversine 거리 공식
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 지구 반지름 (미터)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2
    + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180)
    * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

**출력 구조:**
```json
{
  "candidates": [
    {
      "index": 1,
      "name": "강남역",
      "address": "서울 강남구 강남대로",
      "category": "지하철역",
      "lat": 37.4979,
      "lng": 127.0276,
      "distance": 1240,
      "distanceLabel": "1.2km"
    }
  ],
  "destination": "강남역",
  "transportMode": "transit"
}
```

### 노드 7: Respond to Webhook

Code 노드에서 생성한 JSON을 그대로 응답합니다.

---

## API 설정 가이드

### Naver 검색 API (장소 검색용)

> 주의: NCP(console.ncloud.com)가 아닌 **별도 플랫폼**입니다.

1. [developers.naver.com](https://developers.naver.com) 접속 → 로그인
2. **내 애플리케이션 → 애플리케이션 등록**
3. API 선택: **검색** 체크 (지역검색 포함)
4. **Client ID**, **Client Secret** 복사
5. n8n → Credentials → New → **Basic Auth**
   - Username: Client ID
   - Password: Client Secret

### NCP Maps API (Geocoding, 선택사항)

> 현재 워크플로우에서는 필수가 아닙니다. 주소↔좌표 정밀 변환이 필요할 때 사용합니다.

1. [console.ncloud.com](https://console.ncloud.com) 접속
2. AI·NAVER API → Maps → Application 등록
3. **Geocoding** 체크
4. Client ID / Client Secret 복사

**NCP vs Naver Developers 차이점:**

| 항목 | Naver Developers | NCP |
|------|-----------------|-----|
| 용도 | 검색 API (지역, 블로그 등) | 지도 API (Geocoding, Static Map 등) |
| 사이트 | developers.naver.com | console.ncloud.com |
| 인증 헤더 | `X-Naver-Client-Id` / `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| 과금 | 하루 25,000건 무료 | 별도 요금 |

### Claude API Key

1. [console.anthropic.com](https://console.anthropic.com) 접속
2. API Keys → **Create Key**
3. 키 복사 (`sk-ant-...`)
4. n8n → Credentials → New → **Header Auth**
   - Name: `x-api-key`
   - Value: `sk-ant-...`

---

## 설치 및 배포

### GitHub Pages

```bash
# 1. 저장소 클론
git clone https://github.com/<username>/<repo>.git
cd <repo>

# 2. 변경사항 push
git add index.html
git commit -m "update"
git push origin main

# 3. GitHub Pages 설정
# Settings → Pages → Source → Deploy from branch → main / (root)
```

배포 URL: `https://<username>.github.io/<repo>/`

HTTPS로 서빙되어야 Web Speech API와 Geolocation API가 정상 동작합니다. (`localhost`도 동작)

---

## 사용 방법

1. **Webhook URL 설정**
   - 우상단 설정 아이콘 클릭
   - n8n 워크플로우 활성화 후 복사한 Webhook URL 입력
   - 저장 → localStorage에 영구 저장

2. **음성으로 검색**
   - 마이크 버튼(인디고 원형) 클릭
   - 목적지 말하기: "강남역 가기", "스타벅스 찾아줘", "자동차로 인천공항"
   - 인식 완료 후 자동으로 검색 시작

3. **텍스트로 검색**
   - 하단 입력창에 직접 입력 후 Enter 또는 전송 버튼

4. **길찾기 시작**
   - 검색 결과 카드에서 **길찾기 →** 버튼 클릭
   - 모바일: 네이버지도 앱 자동 실행 (미설치 시 웹으로 열림)
   - PC: 네이버지도 웹으로 열림

5. **즐겨찾기**
   - 카드 우상단 ☆ 버튼으로 저장
   - 상단 즐겨찾기 탭에서 대중교통 / 자동차 바로 선택 가능

---

## 트러블슈팅

### CORS 오류 — `Access-Control-Allow-Origin` 없음

n8n Webhook 노드의 **Response Headers** 설정에서 다음을 추가해야 합니다:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
```

또는 n8n의 **CORS 설정**을 환경변수로 활성화:
```
N8N_CORS_ENABLED=true
N8N_CORS_ORIGINS=*
```

### `webhook-test` vs `webhook` URL

n8n에는 두 가지 Webhook URL이 있습니다:

| URL 형식 | 용도 |
|---------|------|
| `.../webhook-test/map-search` | 워크플로우 **비활성화** 상태에서 테스트 실행 중에만 동작 |
| `.../webhook/map-search` | 워크플로우 **활성화** 후 실제 운영에서 사용 |

설정 화면에 입력하는 URL은 반드시 활성화 상태의 `.../webhook/...` URL을 사용하세요.

### n8n 응답이 배열로 감싸진 경우

n8n Respond to Webhook 노드의 설정에 따라 응답이 `[{...}]` 배열로 올 수 있습니다. 프론트엔드 파싱 코드에서 이미 처리하고 있지만, n8n 워크플로우에서 직접 확인하려면 마지막 Code 노드에서 `return [{ json: result }]` 형식으로 반환하고, Respond to Webhook에서 **First Entry JSON** 모드를 사용하면 배열 없이 `{...}` 형태로 수신됩니다.

### Claude API 크레딧 소진

증상: `401 Unauthorized` 또는 `529 Overloaded`

- [console.anthropic.com](https://console.anthropic.com) → Billing에서 크레딧 잔액 확인
- Haiku 모델은 입력 100만 토큰당 $0.25로 매우 저렴합니다. 1회 검색에 약 200~400 토큰 사용 (약 $0.0001)
- 크레딧이 있는데도 429 오류가 나면 Rate Limit입니다 — n8n Code 노드에서 retry 로직 추가 또는 Free Tier에서 유료 플랜으로 업그레이드

### 음성 인식이 안 될 때

- **크롬 브라우저 필수** (Firefox, Safari는 미지원 또는 제한적 지원)
- HTTPS 또는 localhost에서만 동작 (HTTP에서는 마이크 권한 자체가 차단됨)
- 마이크 권한 팝업에서 반드시 **허용** 선택

### 위치 정보를 가져오지 못할 때

위치 권한을 거부하면 서울시청(37.5665, 126.9780)을 기본값으로 사용합니다. 거리 계산의 정확도가 낮아지지만 검색 자체는 정상 동작합니다.
