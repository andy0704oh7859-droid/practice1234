# 토익한알

TOEIC 단어와 Part 5 문법 문제를 매일 조금씩 공부하는 모바일 웹앱입니다.
프런트엔드는 프레임워크 없이 HTML/CSS/JavaScript로 만들었고, AI 기능은 Node.js(Express) 서버를 통해 OpenAI API를 호출합니다.

## 주요 기능

- **단어 학습**: 1,500개 TOEIC 단어를 랜덤 순서로 학습하고, 내 단어장에 저장
- **Part 5 문제 풀기**: 500문제를 전체 회차로 풀거나, 문법 유형·세부 유형별로 집중 학습
- **오답노트**: 틀린 문제를 자동으로 모아 다시 풀기. 오답 문제의 핵심 단어는 내 단어장에 자동 저장
- **성적표 분석기 (Beta)**: 성적표의 백분율을 입력하면 강점과 약점을 분석
- **한알 AI**: 화면 위에 떠 있는 버튼으로 단어, 문장 해석, Part 5 문제를 한알이에게 질문 (텍스트 전용)

학습 기록은 브라우저의 localStorage에 저장되므로 같은 브라우저에서는 새로고침해도 유지됩니다.

## 실행 방법

Node.js 22 이상이 필요합니다.

```bash
npm install
cp .env.example .env
```

`.env` 파일을 열어 OpenAI API 키를 입력합니다.

```
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-6-luna
```

서버를 실행합니다.

```bash
npm start
```

브라우저에서 <http://127.0.0.1:3000/> 을 엽니다. 포트를 바꾸려면 `.env`에 `PORT=원하는포트`를 추가하세요.

> `index.html`을 파일로 직접 열면(`file://`) 학습 데이터를 불러올 수 없습니다. 반드시 서버로 실행하세요.

### Windows에서 Node.js 없이 실행

`serve.bat`을 더블클릭하면 PowerShell 정적 서버가 <http://localhost:5500/> 에서 실행됩니다.
단어·Part 5·오답노트·성적표 분석기는 그대로 동작하지만, **한알 AI는 Node.js 서버(`npm start`)에서만 동작합니다.**

## 프로젝트 구조

```
index.html                              앱 진입점
script.js                               화면 렌더링, 학습 로직, 한알 AI 채팅
style.css                               스타일
server.js                               Express 서버 (정적 파일 제공 + AI API)
assets/hanali/                          한알이 마스코트 이미지
toeic_hanal_vocab_beta_v3_1500.json     단어 데이터 (1,500개)
toeic_hanal_part5_beta_v6_500.json      Part 5 문제 데이터 (500문제)
serve.bat, serve.ps1                    Windows용 정적 서버
.env.example                            환경 변수 예시
```

## API

| 경로 | 설명 |
| --- | --- |
| `POST /api/hanali-assistant` | 한알 AI 질문. 본문: `{ "message": "...", "history": [...] }` |
| `POST /api/openai-test` | OpenAI 연결 확인용 |

## 보안

- OpenAI API 키는 서버의 `.env`에서만 읽으며, 브라우저로 전달되지 않습니다.
- `.env`는 `.gitignore`에 포함되어 있으므로 커밋하지 마세요.
- 서버는 `.env`, `server.js`, `package.json`, `node_modules` 등 서버 전용 파일을 브라우저에 제공하지 않습니다.
- 과도한 호출을 막기 위해 한알 AI 요청은 분당 20회로 제한됩니다.
