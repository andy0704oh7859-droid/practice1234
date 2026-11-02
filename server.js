// 토익한알 로컬 백엔드
// - 기존 프런트엔드(index.html, script.js, style.css, assets, JSON 데이터)를 그대로 제공
// - OpenAI API 키는 서버의 환경 변수(.env)에서만 읽음. 브라우저 쪽 파일에는 절대 넣지 않음
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import OpenAI from "openai";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// 프로젝트 폴더를 그대로 정적 제공하므로, 서버 전용 파일은 브라우저로 내보내지 않음
const SERVER_ONLY = /^\/(node_modules(\/|$)|server\.js$|package(-lock)?\.json$)/i;
app.use((req, res, next) => {
  if (SERVER_ONLY.test(decodeURIComponent(req.path))) return res.status(404).end();
  next();
});

// 키가 없으면 서버는 그대로 띄우고, 테스트 요청에서만 안내 오류를 돌려줌
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// 임시 연결 확인용 엔드포인트 (성적표 분석기와는 아직 연결하지 않음)
app.post("/api/openai-test", async (req, res) => {
  if (!openai) {
    return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set. Add it to .env and restart the server." });
  }
  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: "Reply with only: API connection successful",
    });
    res.json({ ok: true, model: response.model, output: response.output_text });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(`[OpenAI] ${err.message} (request ${err.requestID ?? "-"})`);
      // OpenAI 의 오류 문구에는 키 일부가 섞일 수 있어 브라우저에는 상태/코드만 보냄 (자세한 내용은 서버 로그)
      return res.status(502).json({
        ok: false,
        status: err.status ?? null,
        code: err.code ?? null,
        error: "OpenAI request failed. See the server log for details.",
      });
    }
    console.error("[OpenAI] unexpected error", err);
    res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
});

/* ---------- 한알이에게 물어보기 (텍스트 전용 TOEIC 도우미) ---------- */

const HANALI_INSTRUCTIONS = `You are Hanali (한알이), an AI TOEIC study assistant inside the Korean app "토익한알".
The user is a Korean learner studying English and TOEIC.

Language
- Answer in Korean by default. Use English only for English words, examples, and quoted sentences, or when the user asks for English.

Vocabulary words or expressions
- Give the most relevant Korean meanings, TOEIC-relevant meaning first, and the part of speech.
- Explain how it is used in TOEIC contexts (business, office, notices, emails).
- For nouns, say whether they are countable or uncountable when it matters. For verbs, say whether they are transitive or intransitive when it matters.
- Add important collocations when useful.
- Give a natural English example sentence with a Korean translation.
- Distinguish confusing meanings or similar words when useful.
- Give pronunciation only when the user asks for it.

English sentences
- Give a natural Korean translation.
- Explain the important grammar or structure and the key vocabulary; mark S / V / O / C / M when it helps.

TOEIC Part 5 questions
- If enough information is given, state the correct answer clearly.
- Explain the decisive reason it is correct and name the tested grammar or vocabulary point.
- When choices are included, explain briefly why each other choice is wrong. Keep it practical for TOEIC study.

Length and style
- Simple question → short, direct answer. Detailed analysis requested → more detail.
- Avoid unnecessary padding. Keep a friendly but mature tone (not childish).
- Formatting: short paragraphs, "-" bullet lists, and **bold** for key terms only. No tables, no headings, no code blocks.

Honesty
- Do not invent information when a question is incomplete. Ask for missing choices or context only when it is actually necessary.
- This version is text only. You cannot see images; if the user refers to an image or screenshot, ask them to paste the text instead.
- For follow-up messages, use the earlier conversation to understand what the user is referring to.`;

const ASSISTANT = {
  maxMessageChars: 4000,      // 한 번에 붙여 넣는 Part 5 문제/지문 정도
  maxHistoryItems: 12,        // API 로 보내는 최근 대화 수
  maxHistoryItemChars: 2000,  // 이전 메시지는 이 길이까지만 보냄
  maxOutputTokens: 1500,
  requestsPerMinute: 20,
};
const FRIENDLY_ERROR = "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

// 로컬 단일 사용자용 간단한 요청 제한 (실수로 반복 호출되어 비용이 커지는 것 방지)
const recentRequests = [];
function rateLimited() {
  const now = Date.now();
  while (recentRequests.length && now - recentRequests[0] > 60_000) recentRequests.shift();
  if (recentRequests.length >= ASSISTANT.requestsPerMinute) return true;
  recentRequests.push(now);
  return false;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-ASSISTANT.maxHistoryItems)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, ASSISTANT.maxHistoryItemChars) }));
}

app.post("/api/hanali-assistant", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ ok: false, error: "질문을 입력해 주세요." });
  if (message.length > ASSISTANT.maxMessageChars) {
    return res.status(400).json({ ok: false, error: `질문은 ${ASSISTANT.maxMessageChars}자 이내로 입력해 주세요.` });
  }
  if (!openai) {
    console.error("[Hanali] OPENAI_API_KEY is not set");
    return res.status(503).json({ ok: false, error: FRIENDLY_ERROR });
  }
  if (rateLimited()) {
    return res.status(429).json({ ok: false, error: "질문이 너무 많아요. 잠시 후 다시 시도해 주세요." });
  }

  try {
    const response = await openai.responses.create(
      {
        model: MODEL,
        instructions: HANALI_INSTRUCTIONS,
        input: [...cleanHistory(req.body.history), { role: "user", content: message }],
        max_output_tokens: ASSISTANT.maxOutputTokens,
        reasoning: { effort: "low" },
        store: false,
      },
      { timeout: 60_000, maxRetries: 1 }
    );
    const reply = (response.output_text || "").trim();
    if (!reply) {
      console.error(`[Hanali] empty reply (status ${response.status}, ${JSON.stringify(response.incomplete_details)})`);
      return res.status(502).json({ ok: false, error: FRIENDLY_ERROR });
    }
    if (response.status === "incomplete") console.warn(`[Hanali] reply truncated: ${JSON.stringify(response.incomplete_details)}`);
    res.json({ ok: true, reply, truncated: response.status === "incomplete" });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(`[Hanali] OpenAI ${err.status ?? "connection"} ${err.code ?? ""}: ${err.message} (request ${err.requestID ?? "-"})`);
    } else {
      console.error("[Hanali] unexpected error", err);
    }
    res.status(502).json({ ok: false, error: FRIENDLY_ERROR });
  }
});

app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// dotfiles: "deny" → .env, .gitignore 등은 403 으로 막힘
app.use(express.static(ROOT, { dotfiles: "deny", index: "index.html" }));

// 잘못된 JSON 등: 스택 트레이스 대신 짧은 JSON 만 돌려줌
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("[server] error", err);
  res.status(status).json({ ok: false, error: status === 413 ? "질문이 너무 길어요." : "요청을 처리하지 못했어요." });
});

app.listen(PORT, HOST, () => {
  console.log(`토익한알 server: http://${HOST}:${PORT}/`);
  console.log(`OpenAI model: ${MODEL} | API key: ${openai ? "loaded" : "missing (set OPENAI_API_KEY in .env)"}`);
});
