/* ==========================================================
   토익한알 — script.js (Vanilla JS)
   구조:
   1) 설정/데이터 로딩
   2) 상태(state)
   3) DOM 헬퍼
   4) 화면 렌더링 (home / vocab / part5 / analysis=성적표 분석기, 홈의 하위 화면)
   5) 내비게이션 & 초기화
   ========================================================== */

"use strict";

/* ---------- 1. 설정 / 데이터 로딩 ---------- */

const DATA_FILES = {
  vocab: "toeic_hanal_vocab_beta_v3_1500.json",
  part5: "toeic_hanal_part5_beta_v6_500.json",
};

const ERROR_MESSAGE = "학습 데이터를 불러오지 못했습니다.";

// 각 JSON 은 최상위가 배열이어야 하고, 개수는 항상 배열 길이로 계산합니다.
async function loadJson(name, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("최상위 데이터가 배열이 아닙니다.");
    if (data.length === 0) throw new Error("데이터 배열이 비어 있습니다.");
    return data;
  } catch (err) {
    console.error(`[토익한알] "${name}" 데이터 로딩 실패 (${url})`, err);
    if (location.protocol === "file:") {
      console.error("[토익한알] file:// 로 열면 fetch 가 차단됩니다. 로컬 서버(serve.bat 등)로 실행하세요.");
    }
    return null;
  }
}

/* ---------- 2. 상태 ---------- */

const state = {
  view: "home",
  data: { vocab: null, part5: null },
  // mode: study | mine, filter: all | manual | auto
  // detailKey: 내 단어장에서 열어 둔 상세 항목의 정규화 key (없으면 목록 화면), listScroll: 목록 스크롤 위치
  // 단어 학습: order = 이번 회차의 단어 ID 순서(랜덤), index = 지금 보고 있는 위치. (order/index 는 localStorage 에 저장)
  vocab: { order: [], index: 0, mode: "study", filter: "all", detailKey: null, confirmDelete: false, listScroll: 0 },
  // 일반 Part 5 학습: order = 남은 문제 ID 순서(랜덤), index = 현재 위치. (order/index 는 localStorage 에 저장)
  part5: { order: [], index: 0, selected: null, submitted: false },
  // 문제 풀기 탭 안의 위치. select(유형 선택) | detail(대분류) | normal(전체 회차) | focused(유형 학습)
  // 저장하지 않음. 일반 회차(state.part5)와는 별개
  part5Hub: { screen: "select", category: null },
  // 유형/세부 유형 집중 학습. 새로고침 뒤에는 유지하지 않음 (메모리 전용)
  focusedPart5: {
    active: false, category: null, subcategory: null, order: [], index: 0,
    selected: null, submitted: false, correct: 0, finished: false,
  },
  // 오답 다시 풀기 / 단어 복습 퀴즈: 세션 전용 상태 (저장하지 않음)
  retry: { active: false, order: [], index: 0, selected: null, submitted: false, correct: 0, finished: false },
  vquiz: { active: false, count: 5, questions: [], index: 0, selected: null, submitted: false, correct: 0, finished: false },
  // localStorage 에서 읽어온 사용자 데이터 (메모리 캐시)
  saved: { manualIds: [], auto: [], wrongNotes: [], completed: new Set(), vocabCompleted: new Set() },
  // Part 5 내부 탭(문제 풀기 / 오답노트). 풀이 진행 상태(state.part5)와 분리해 둠
  notes: { mode: "solve", detailId: null, confirmDelete: false, listScroll: 0 },
  // 성적표 분석기 Beta: 메모리 전용 (저장하지 않음, 새로고침하면 초기화)
  // values = 칸별 입력 문자열({L1:"87",...}), errors = 칸별 안내 문구, result = analyzeScores 결과(없으면 입력 화면)
  analysis: { values: {}, errors: {}, result: null },
};

/* ---------- 2-b. 사용자 데이터 (localStorage) ----------
   toeicHanalSavedVocab : ["VOC-0001", ...]            직접 저장한 단어의 ID 목록
   toeicHanalAutoVocab  : [{ vocabId?, key, text, sources:[질문ID], addedAt }, ...]
                          Part 5 오답의 reviewVocabulary(단어 DB ID)로 자동 수집한 학습 항목
                          vocabId 는 v2 이후 저장분에만 있고, 이전 저장분(key/text 만 있음)도 계속 지원합니다.
   toeicHanalPart5WrongNotes : [{ questionId, selectedAnswer, wrongCount, lastWrongAt }, ...]
                          Part 5 오답노트. 문제 내용/해설은 저장하지 않고 questionId 로 part5 JSON 에서 가져옵니다.
                          (내 단어장 데이터와는 완전히 별개)
   toeicHanalPart5Completed  : ["P5-0001", ...]        일반 Part 5 학습에서 "정답 확인"까지 마친 문제 ID (정답/오답 무관)
   toeicHanalPart5Session    : { order:[ID...], index }  진행 중인 일반 학습 세션(랜덤 순서와 현재 위치)
   toeicHanalVocabCompleted  : ["VOC-0001", ...]        단어 학습에서 "다음"을 눌러 마친 단어/표현 ID (현재 회차)
   toeicHanalVocabSession    : { order:[ID...], index }  진행 중인 단어 학습 회차(랜덤 순서와 현재 위치)
   단어 내용(뜻, 발음 등)은 저장하지 않고, 화면을 그릴 때 vocab JSON 에서 가져옵니다. */

const STORAGE_KEYS = {
  manual: "toeicHanalSavedVocab",
  auto: "toeicHanalAutoVocab",
  wrongNotes: "toeicHanalPart5WrongNotes",
  completed: "toeicHanalPart5Completed",
  session: "toeicHanalPart5Session",
  vocabCompleted: "toeicHanalVocabCompleted",
  vocabSession: "toeicHanalVocabSession",
};

// 비교용 문자열 정규화: 앞뒤 공백 제거, 소문자, 연속 공백 1개로
function normalize(text) {
  return typeof text === "string" ? text.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function readStored(key, isValidItem) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("저장된 값이 배열이 아닙니다.");
    return parsed.filter(isValidItem);
  } catch (err) {
    console.error(`[토익한알] localStorage "${key}" 를 읽지 못해 빈 목록으로 복구합니다.`, err);
    return [];
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[토익한알] localStorage "${key}" 저장 실패 (이번 접속 중에만 유지됩니다)`, err);
  }
}

function loadSavedState() {
  const manualIds = readStored(STORAGE_KEYS.manual, (v) => hasText(v));
  const auto = readStored(STORAGE_KEYS.auto, (v) => v && typeof v === "object" && hasText(v.key) && hasText(v.text))
    .map((v) => ({
      vocabId: hasText(v.vocabId) ? v.vocabId : null, // 이전 저장분에는 없음
      key: normalize(v.key),
      text: v.text.trim(),
      sources: Array.isArray(v.sources) ? v.sources.filter(hasText) : [],
      addedAt: typeof v.addedAt === "number" ? v.addedAt : 0,
    }));
  state.saved.manualIds = [...new Set(manualIds)];
  // 같은 key 의 기록이 중복되어 있으면 하나로 합치고 출처 질문 ID 는 모두 보존
  const byKey = new Map();
  for (const a of auto) {
    const prev = byKey.get(a.key);
    if (!prev) { byKey.set(a.key, a); continue; }
    if (!prev.vocabId && a.vocabId) prev.vocabId = a.vocabId;
    for (const s of a.sources) if (!prev.sources.includes(s)) prev.sources.push(s);
  }
  state.saved.auto = [...byKey.values()];

  // 오답노트: questionId 당 기록 1개만 유지 (중복이 있으면 횟수를 합치고 최근 값을 사용)
  const notes = readStored(STORAGE_KEYS.wrongNotes, (v) => v && typeof v === "object" && hasText(v.questionId));
  const byQuestion = new Map();
  for (const n of notes) {
    const rec = {
      questionId: n.questionId.trim(),
      selectedAnswer: hasText(n.selectedAnswer) ? n.selectedAnswer : null,
      wrongCount: Number.isFinite(n.wrongCount) && n.wrongCount >= 1 ? Math.floor(n.wrongCount) : 1,
      lastWrongAt: Number.isFinite(n.lastWrongAt) ? n.lastWrongAt : 0,
    };
    const prev = byQuestion.get(rec.questionId);
    if (!prev) { byQuestion.set(rec.questionId, rec); continue; }
    prev.wrongCount += rec.wrongCount;
    if (rec.lastWrongAt >= prev.lastWrongAt) {
      prev.lastWrongAt = rec.lastWrongAt;
      prev.selectedAnswer = rec.selectedAnswer;
    }
  }
  state.saved.wrongNotes = [...byQuestion.values()];

  // 일반 학습 완료 문제 ID (배열이 아니거나 깨져 있으면 빈 목록으로 복구)
  state.saved.completed = new Set(readStored(STORAGE_KEYS.completed, (v) => hasText(v)).map((v) => v.trim()));

  // 진행 중인 일반 학습 세션 (실제 유효성은 데이터 로딩 후 restoreNormalSession 에서 다시 검증)
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    const sess = raw == null ? null : JSON.parse(raw);
    if (sess && typeof sess === "object" && Array.isArray(sess.order)) {
      state.part5.order = sess.order.filter(hasText);
      state.part5.index = Number.isInteger(sess.index) && sess.index >= 0 ? sess.index : 0;
    } else if (sess != null) {
      throw new Error("세션 형식이 올바르지 않습니다.");
    }
  } catch (err) {
    console.error(`[토익한알] localStorage "${STORAGE_KEYS.session}" 를 읽지 못해 새 세션으로 시작합니다.`, err);
    state.part5.order = [];
    state.part5.index = 0;
  }

  // 단어 학습: 완료 ID 와 진행 중인 회차 (실제 유효성은 데이터 로딩 후 restoreVocabSession 에서 다시 검증)
  state.saved.vocabCompleted = new Set(readStored(STORAGE_KEYS.vocabCompleted, (v) => hasText(v)).map((v) => v.trim()));
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.vocabSession);
    const sess = raw == null ? null : JSON.parse(raw);
    if (sess && typeof sess === "object" && Array.isArray(sess.order)) {
      state.vocab.order = sess.order.filter(hasText).map((v) => v.trim());
      state.vocab.index = Number.isInteger(sess.index) && sess.index >= 0 ? sess.index : 0;
    } else if (sess != null) {
      throw new Error("세션 형식이 올바르지 않습니다.");
    }
  } catch (err) {
    console.error(`[토익한알] localStorage "${STORAGE_KEYS.vocabSession}" 를 읽지 못해 새 회차로 시작합니다.`, err);
    state.vocab.order = [];
    state.vocab.index = 0;
  }
}

function persistManual() { writeStored(STORAGE_KEYS.manual, state.saved.manualIds); }
function persistAuto() { writeStored(STORAGE_KEYS.auto, state.saved.auto); }
function persistWrongNotes() { writeStored(STORAGE_KEYS.wrongNotes, state.saved.wrongNotes); }

// Part 5 문제 색인 (ID → 문제) — 오답노트가 questionId 로 문제를 찾을 때 사용
const part5Index = new Map();

function buildPart5Index(list) {
  part5Index.clear();
  if (!Array.isArray(list)) return;
  for (const q of list) if (hasText(q.id)) part5Index.set(q.id, q);
}

/* Part 5 오답노트 */
// 오답 제출 시 호출: 같은 문제는 새 기록을 만들지 않고 선택 답/횟수/시각만 갱신
function recordWrongNote(q, selectedAnswer) {
  if (!hasText(q.id)) return;
  const now = Date.now();
  const rec = state.saved.wrongNotes.find((n) => n.questionId === q.id);
  if (rec) {
    rec.selectedAnswer = selectedAnswer;
    rec.wrongCount += 1;
    rec.lastWrongAt = now;
  } else {
    state.saved.wrongNotes.push({ questionId: q.id, selectedAnswer, wrongCount: 1, lastWrongAt: now });
  }
  persistWrongNotes();
}

// 오답노트 기록만 삭제 (내 단어장 데이터는 건드리지 않음)
function removeWrongNote(questionId) {
  state.saved.wrongNotes = state.saved.wrongNotes.filter((n) => n.questionId !== questionId);
  persistWrongNotes();
}

// 단어 DB 색인 (ID / 정규화된 word) — 데이터 로딩 후 생성
const vocabIndex = { byId: new Map(), byWord: new Map() };

function buildVocabIndex(list) {
  vocabIndex.byId.clear();
  vocabIndex.byWord.clear();
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (hasText(item.id)) vocabIndex.byId.set(item.id, item);
    const key = normalize(item.word);
    if (key && !vocabIndex.byWord.has(key)) vocabIndex.byWord.set(key, item);
  }
}

/* 직접 저장 */
function isManualSaved(vocabItem) {
  return state.saved.manualIds.includes(vocabItem.id);
}

function toggleManualSaved(vocabItem) {
  const ids = state.saved.manualIds;
  const at = ids.indexOf(vocabItem.id);
  if (at >= 0) ids.splice(at, 1);
  else ids.push(vocabItem.id);
  persistManual();
}

// 같은 단어(정규화 key)를 가리키는 모든 직접 저장 ID 제거
function removeManualByKey(key) {
  state.saved.manualIds = state.saved.manualIds.filter((id) => {
    const v = vocabIndex.byId.get(id);
    return !(v && normalize(v.word) === key);
  });
  persistManual();
}

/* 오답 자동 수집 */
// 자동 저장 기록 → 단어 DB 항목 찾기: 1) vocabId  2) 정규화된 영어 텍스트  3) 없으면 null(레거시 항목)
function resolveAutoVocab(a) {
  return (a.vocabId && vocabIndex.byId.get(a.vocabId)) || vocabIndex.byWord.get(a.key) || null;
}

// "내 단어장" 에서 같은 항목을 묶는 key: DB 와 연결되면 DB word 기준, 아니면 저장된 key
function autoMergeKey(a) {
  const v = resolveAutoVocab(a);
  return v ? normalize(v.word) : a.key;
}

function removeAutoByKey(key) {
  state.saved.auto = state.saved.auto.filter((a) => autoMergeKey(a) !== key);
  persistAuto();
}

// 오답 제출 시 q.reviewVocabulary (단어 DB ID 목록)만 수집한다.
// q.vocabulary 는 참고용이므로 자동 저장에 사용하지 않는다. reviewVocabulary 가 비어 있으면 아무것도 저장하지 않는다.
function collectWrongAnswerVocab(q) {
  const ids = cleanList(q.reviewVocabulary);
  let changed = false;
  for (const id of ids) {
    const vocab = vocabIndex.byId.get(id.trim());
    if (!vocab) {
      console.warn(`[토익한알] reviewVocabulary ID "${id}" 를 단어 데이터에서 찾지 못해 건너뜁니다. (질문 ${q.id})`);
      continue;
    }
    const key = normalize(vocab.word);
    // 같은 항목(vocabId 또는 key 가 같은 이전 기록)이 이미 있으면 새로 만들지 않고 재사용
    let entry = state.saved.auto.find((a) => a.vocabId === vocab.id || autoMergeKey(a) === key);
    if (!entry) {
      entry = { vocabId: vocab.id, key, text: vocab.word, sources: [], addedAt: Date.now() };
      state.saved.auto.push(entry);
      changed = true;
    } else if (entry.vocabId !== vocab.id) {
      entry.vocabId = vocab.id; // 이전 저장분에 vocabId 를 채워 넣음
      changed = true;
    }
    if (hasText(q.id) && !entry.sources.includes(q.id)) {
      entry.sources.push(q.id);
      changed = true;
    }
  }
  if (changed) persistAuto();
}

// "내 단어장" 표시용 통합 목록: 같은 단어는 한 항목으로 합치고 출처(직접/오답)를 함께 기록
function buildMyVocabList() {
  const map = new Map();
  const getEntry = (key, vocab, text) => {
    let e = map.get(key);
    if (!e) {
      e = { key, vocab, text, manual: false, auto: false, questionIds: [] };
      map.set(key, e);
    }
    return e;
  };
  for (const id of [...state.saved.manualIds].reverse()) {
    const v = vocabIndex.byId.get(id);
    if (!v) continue; // DB 에서 사라진 ID 는 저장값은 유지하되 표시하지 않음
    getEntry(normalize(v.word), v, v.word).manual = true;
  }
  for (const a of [...state.saved.auto].reverse()) {
    const v = resolveAutoVocab(a);
    const e = getEntry(v ? normalize(v.word) : a.key, v, v ? v.word : a.text);
    e.auto = true;
    for (const qid of a.sources) if (!e.questionIds.includes(qid)) e.questionIds.push(qid);
  }
  return [...map.values()];
}

/* ---------- 3. DOM 헬퍼 ---------- */

const mainEl = document.getElementById("main");

// 텍스트는 항상 textContent 로 넣어 안전하게 렌더링합니다.
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "disabled" || key === "hidden") node[key] = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

// 값이 실제로 있는 문자열인지 (null / undefined / 공백 제외)
function hasText(v) {
  return typeof v === "string" && v.trim() !== "";
}

// 배열에서 비어있지 않은 문자열만 남김
function cleanList(v) {
  return Array.isArray(v) ? v.filter(hasText) : [];
}

function svgIcon(pathData) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of pathData) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

const ICON_BOOK = ["M5 4.5h10.5a3 3 0 0 1 3 3V19.5H8a3 3 0 0 1-3-3z", "M5 16.5a3 3 0 0 1 3-3h10.5"];
const ICON_CHECK = ["M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "m8.5 12 2.5 2.5 4.5-5"];

/* ---------- 3-b. 마스코트 "한알이" ----------
   장식용 이미지이므로 alt="" (스크린리더는 옆의 텍스트만 읽음). className 으로 크기/애니메이션을 정함:
   mascot-home / mascot-head / mascot-feedback / mascot-complete / mascot-empty  (+ mascot-idle / mascot-pop / mascot-drop / mascot-jump) */
const MASCOT_DIR = "assets/hanali/";
const MASCOT_FILES = {
  default: "hanali_default.png",
  study: "hanali_study.png",
  think: "hanali_think.png",
  correct: "hanali_correct.png",
  wrong: "hanali_wrong.png",
  complete: "hanali_complete.png",
  ai: "hanali_ai_default.png",   // 한알 AI 떠 있는 버튼 전용
};

function mascot(name, className) {
  return el("img", {
    class: "mascot" + (className ? " " + className : ""),
    src: MASCOT_DIR + (MASCOT_FILES[name] || MASCOT_FILES.default),
    alt: "", width: "1254", height: "1254", decoding: "async", draggable: "false",
    // 이미지를 불러오지 못하면 빈 자리 없이 조용히 제거 (학습 내용은 그대로)
    onError: (e) => e.target.remove(),
  });
}

// 화면별로 곧 필요한 마스코트를 한가한 시간에 미리 불러옴 (각 파일이 커서 한꺼번에 받지 않음)
const VIEW_MASCOTS = { home: [], vocab: ["study", "complete"], part5: ["think", "correct", "wrong", "complete"], analysis: ["study"] };
const preloadedMascots = new Set();
function preloadMascots(view) {
  const run = () => {
    for (const name of VIEW_MASCOTS[view] || []) {
      if (preloadedMascots.has(name)) continue;
      preloadedMascots.add(name);
      new Image().src = MASCOT_DIR + MASCOT_FILES[name];
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 800);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// mascotName 을 주면 제목 옆에 작은 마스코트를 보여줌 (학습 내용 영역은 건드리지 않음)
function progressHeader(title, current, total, mascotName) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return el("div", { class: "study-head" },
    el("div", { class: "study-head-row" },
      el("div", { class: "study-title-wrap" },
        mascotName && mascot(mascotName, "mascot-head"),
        el("h1", { class: "study-title", text: title })
      ),
      el("p", { class: "study-count", "aria-label": `전체 ${total}개 중 ${current}번째` },
        el("strong", { text: String(current) }), ` / ${total}`)
    ),
    el("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(current) },
      el("div", { class: "progress-bar", style: `width:${percent}%` }))
  );
}

function errorView() {
  return el("section", { class: "view" },
    el("div", { class: "empty-state", role: "alert" },
      mascot("think", "mascot-empty"),
      el("h2", { text: ERROR_MESSAGE }),
      el("p", { text: "잠시 후 다시 시도해 주세요." }),
      el("button", { type: "button", class: "btn btn-primary", text: "홈으로", onClick: () => go("home") })
    )
  );
}

/* ---------- 4-a. 홈 ---------- */

// 홈 카드의 진행 표시: 이미 저장된 완료 수 / 전체 수만 사용 (새 통계 없음). 데이터가 아직 없으면 null
function homeProgress(done, total, label) {
  if (!(total > 0)) return null;
  const percent = Math.min(100, Math.round((done / total) * 100));
  return el("div", { class: "card-progress" },
    el("div", { class: "card-progress-row" },
      el("span", { class: "card-progress-label", text: label }),
      el("span", { class: "card-progress-count" }, el("strong", { text: String(done) }), ` / ${total}`)
    ),
    el("div", { class: "progress is-slim", role: "progressbar", "aria-label": label,
      "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done) },
      el("div", { class: "progress-bar", style: `width:${percent}%` }))
  );
}

function homeCtaLabel(done, total, startLabel) {
  if (total > 0 && done >= total) return "학습 결과 보기";
  return done > 0 ? "이어서 학습하기" : startLabel;
}

function renderHome() {
  const vocabTotal = state.data.vocab ? vocabIndex.byId.size : 0;
  const vocabDone = vocabTotal > 0 ? vocabCompletedCount() : 0;
  const p5Total = state.data.part5 ? part5Index.size : 0;
  const p5Done = p5Total > 0 ? completedCount() : 0;
  const mineCount = vocabTotal > 0 ? buildMyVocabList().length : 0;
  const noteCount = p5Total > 0 ? state.saved.wrongNotes.filter((n) => part5Index.has(n.questionId)).length : 0;

  const studyCard = ({ kind, title, desc, iconPath, progress, note, cta, ctaClass, target }) =>
    el("article", { class: `card study-card is-${kind}` },
      el("div", { class: "study-card-head" },
        el("div", { class: "study-card-icon" }, svgIcon(iconPath)),
        el("div", null, el("h2", { text: title }), el("p", { text: desc }))
      ),
      progress,
      hasText(note) && el("p", { class: "study-card-note", text: note }),
      el("button", { type: "button", class: `btn btn-block ${ctaClass}`, text: cta, onClick: () => go(target) })
    );

  return el("section", { class: "view" },
    el("div", { class: "home-hero" },
      el("div", { class: "home-hero-text" },
        el("span", { class: "eyebrow", text: "토익한알" }),
        el("h1", { class: "home-title", text: "오늘도 한알 챙겨볼까요?" }),
        el("p", { class: "home-sub", text: "매일 조금씩, 꾸준하게 토익을 공부해 보세요." })
      ),
      el("div", { class: "home-hero-aside" }, mascot("default", "mascot-home mascot-idle"))
    ),
    el("div", { class: "study-cards" },
      studyCard({
        kind: "vocab", title: "단어 공부", desc: "토익 단어를 하나씩 익혀보세요.", iconPath: ICON_BOOK,
        progress: homeProgress(vocabDone, vocabTotal, "이번 회차 학습"),
        note: mineCount > 0 ? `내 단어장 ${mineCount}개` : "",
        cta: homeCtaLabel(vocabDone, vocabTotal, "단어 공부 시작"), ctaClass: "btn-primary", target: "vocab",
      }),
      studyCard({
        kind: "part5", title: "Part 5", desc: "문법과 어휘 문제를 풀어보세요.", iconPath: ICON_CHECK,
        progress: homeProgress(p5Done, p5Total, "이번 회차 완료"),
        note: noteCount > 0 ? `오답노트 ${noteCount}문제` : "",
        cta: homeCtaLabel(p5Done, p5Total, "Part 5 시작"), ctaClass: "btn-accent", target: "part5",
      }),
      analyzerCard()
    )
  );
}

// 홈의 "성적표 분석기 Beta" 진입 카드. 하단 메뉴에는 넣지 않고, 학습 카드보다 가볍게(마스코트 + 한 줄 설명 + 버튼) 구성
function analyzerCard() {
  const art = mascot("think", "mascot-card");
  art.loading = "lazy";   // 화면 아래쪽 카드라서 스크롤해서 가까워질 때 불러옴
  return el("article", { class: "card analyzer-card" },
    el("div", { class: "analyzer-head" },
      art,
      el("div", { class: "analyzer-text" },
        el("h2", null, "성적표 분석기", el("span", { class: "beta-tag", text: "Beta" })),
        el("p", { text: "성적표의 백분율을 입력하면 한알이가 강점과 약점을 분석해 드려요." }))
    ),
    el("button", { type: "button", class: "btn btn-secondary btn-block", text: "성적 분석하기", onClick: () => go("analysis") })
  );
}

/* ---------- 4-b. 단어 공부 ---------- */

function vocabSegmented() {
  const tab = (mode, label) => el("button", {
    type: "button", class: "segmented-btn", text: label,
    "aria-pressed": String(state.vocab.mode === mode),
    onClick: () => { state.vocab.mode = mode; closeVocabDetail(); render(true); },
  });
  return el("div", { class: "segmented", role: "group", "aria-label": "단어 화면 선택" },
    tab("study", "단어 학습"), tab("mine", "내 단어장"));
}

function renderVocab() {
  if (!state.data.vocab) return errorView();
  const inMine = state.vocab.mode === "mine";
  const quizOn = inMine && state.vquiz.active;
  const body = inMine ? (quizOn ? renderVocabQuiz() : renderMyVocab()) : renderVocabStudy();
  // 상세/복습 퀴즈 화면에서는 전환 탭 대신 "← 내 단어장" 뒤로가기가 맨 위에 옴
  const showTabs = !(inMine && (state.vocab.detailKey || quizOn));
  const studyPage = body.classList.contains("vocab-study-view");
  return el("section", { class: "view" + (studyPage ? " vocab-study-page" : "") }, showTabs && vocabSegmented(), body);
}

function closeVocabDetail() {
  state.vocab.detailKey = null;
  state.vocab.confirmDelete = false;
}

function bookmarkIcon() {
  return svgIcon(["M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"]);
}

// 단어 학습 화면과 내 단어장 상세 화면이 함께 쓰는 단어 카드 (JSON 에 실제로 있는 정보만 표시)
// afterHead: 단어 머리 부분 바로 아래에 넣을 요소(저장 버튼 등), tail: 카드 맨 아래에 넣을 요소(출처 등)
function vocabCard(item, afterHead, tail) {
  // 품사 · 자/타동사 · 가산성
  const metaParts = [item.partOfSpeech, item.transitivity, item.countability].filter(hasText);
  const meanings = cleanList(item.meaning);
  const collocations = cleanList(item.collocations);

  const head = el("div", null,
    // 긴 표현(예: in accordance with)은 글자 크기를 조금 줄여 모바일에서 보기 좋게 줄바꿈
    el("h2", { class: "vocab-word" + (item.word.length > 16 ? " is-long" : ""), lang: "en", text: item.word }),
    hasText(item.pronunciationKo) && el("p", { class: "vocab-pron", text: item.pronunciationKo }),
    (metaParts.length > 0 || hasText(item.topic)) && el("div", { class: "chips" },
      metaParts.length > 0 && el("span", { class: "chip", text: metaParts.join(" · ") }),
      hasText(item.topic) && el("span", { class: "chip is-soft", text: item.topic })
    )
  );

  return el("article", { class: "card vocab-card" },
    hasText(item.word) && head,
    afterHead,
    meanings.length > 0 && el("ul", { class: "vocab-meaning" }, meanings.map((m) => el("li", { text: m }))),
    collocations.length > 0 && el("div", null,
      el("h3", { class: "section-label", text: "주요 표현" }),
      el("ul", { class: "colloc-list" }, collocations.map((c) => el("li", { text: c })))
    ),
    hasText(item.example) && el("div", null,
      el("h3", { class: "section-label", text: "예문" }),
      el("div", { class: "example-box" },
        el("p", { class: "example-en", lang: "en", text: item.example }),
        hasText(item.translation) && el("p", { class: "example-ko", text: item.translation })
      )
    ),
    tail
  );
}

/* 단어 학습 회차 (완료 기록 / 랜덤 순서 / 새로고침 복원)
   - "다음"을 누른 단어만 완료 처리 (카드를 보여준 것만으로는 완료가 아님)
   - 이전 버튼으로 돌아가도 완료 기록은 그대로 */
function persistVocabCompleted() { writeStored(STORAGE_KEYS.vocabCompleted, [...state.saved.vocabCompleted]); }
function persistVocabSession() {
  writeStored(STORAGE_KEYS.vocabSession, { order: state.vocab.order, index: state.vocab.index });
}

// 현재 단어 DB 에 존재하는 완료 단어 수
function vocabCompletedCount() {
  let n = 0;
  for (const id of state.saved.vocabCompleted) if (vocabIndex.byId.has(id)) n += 1;
  return n;
}

// 저장된 회차를 복원 (데이터 로딩 후 1회 호출):
// - 지금 보던 위치 이전(이미 본 단어)은 그대로 두고, 지금 보던 단어는 완료 여부와 상관없이 같은 자리에 유지
// - 그 뒤 순서에서는 사라진 ID/중복/이미 완료한 단어를 제거
// - 순서에 없는 미완료 단어(예: DB 에 새로 추가된 단어)는 섞어서 뒤에 붙임
function restoreVocabSession() {
  const s = state.vocab;
  const done = state.saved.vocabCompleted;
  const raw = s.order;
  const at = Math.min(s.index, raw.length);
  const queue = [];
  const seen = new Set();
  const take = (id, skipCompleted) => {
    if (seen.has(id) || !vocabIndex.byId.has(id) || (skipCompleted && done.has(id))) return;
    seen.add(id);
    queue.push(id);
  };
  raw.slice(0, at).forEach((id) => take(id, false));
  const position = queue.length; // 지금 보던 단어가 놓일 위치
  raw.slice(at).forEach((id, i) => take(id, i > 0));
  shuffle([...vocabIndex.byId.keys()]).forEach((id) => take(id, true));
  s.order = queue;
  s.index = Math.min(position, queue.length);
  persistVocabSession();
}

function vocabCurrentItem() {
  const id = state.vocab.order[state.vocab.index];
  return id ? vocabIndex.byId.get(id) || null : null;
}

// "새 회차 시작": 단어 학습의 완료 기록/세션만 초기화. 내 단어장, Part 5 등 다른 데이터는 건드리지 않음
function startNewVocabCycle() {
  state.saved.vocabCompleted = new Set();
  persistVocabCompleted();
  state.vocab.order = shuffle([...vocabIndex.byId.keys()]);
  state.vocab.index = 0;
  persistVocabSession();
  render(true);
}

function vocabPrev() {
  const s = state.vocab;
  if (s.index <= 0) return;
  s.index -= 1; // 완료 기록은 바꾸지 않음
  persistVocabSession();
  render(true);
}

function vocabNext() {
  const s = state.vocab;
  const id = s.order[s.index];
  if (!id) return;
  state.saved.vocabCompleted.add(id); // Set 이라 중복 저장되지 않음
  persistVocabCompleted();
  s.index += 1; // 마지막 단어였다면 order 끝을 넘어가 "회차 완료" 화면이 표시됨
  persistVocabSession();
  render(true);
}

function renderVocabStudy() {
  const s = state.vocab;
  const total = vocabIndex.byId.size;
  if (total === 0) return errorView();
  const done = vocabCompletedCount();
  const item = vocabCurrentItem();

  // 남은 단어가 없으면 처음부터 자동 재시작하지 않고 회차 완료 화면을 보여줌
  if (!item) {
    return completionView({
      title: "단어 1회 학습 완료!",
      message: "현재 준비된 단어와 표현을 모두 학습했어요.",
      stats: [{ value: `${done} / ${total}`, label: "완료" }],
      actions: [
        { label: "새 회차 시작", primary: true, onClick: startNewVocabCycle },
        { label: "홈으로", onClick: () => go("home") },
      ],
    });
  }

  // 아직 완료하지 않은 단어: 완료 수 + 1번째. 이전 버튼으로 돌아가 본 단어(이미 완료): 그 위치 번호
  const viewingDone = state.saved.vocabCompleted.has(item.id);
  const current = Math.min(total, viewingDone ? Math.min(s.index + 1, done) : done + 1);

  const saved = isManualSaved(item);
  const saveBtn = el("button", {
    type: "button", class: "save-btn" + (saved ? " is-saved" : ""),
    "aria-pressed": String(saved),
    onClick: () => { toggleManualSaved(item); render(false); },
  }, bookmarkIcon(), saved ? "저장됨" : "단어장에 저장");

  const card = vocabCard(item, hasText(item.id) && saveBtn);

  const actions = el("div", { class: "study-actions is-pair vocab-study-actions" },
    el("button", {
      type: "button", class: "btn btn-secondary", text: "이전", disabled: s.index === 0,
      onClick: vocabPrev,
    }),
    el("button", {
      type: "button", class: "btn btn-primary", text: s.index >= s.order.length - 1 ? "학습 마치기" : "다음",
      onClick: vocabNext,
    })
  );

  return el("div", { class: "vocab-study-view" }, progressHeader("단어 공부", current, total, "study"), card, actions);
}

/* ---------- 4-b2. 내 단어장 ---------- */

const MY_VOCAB_FILTERS = [
  { id: "all", label: "전체" },
  { id: "manual", label: "직접 저장" },
  { id: "auto", label: "오답에서 저장" },
];

function renderMyVocab() {
  const all = buildMyVocabList();
  const counts = {
    all: all.length,
    manual: all.filter((e) => e.manual).length,
    auto: all.filter((e) => e.auto).length,
  };
  const filter = state.vocab.filter;

  if (state.vocab.detailKey) {
    const entry = all.find((e) => e.key === state.vocab.detailKey);
    if (entry) return renderMyVocabDetail(entry, filter);
    closeVocabDetail(); // 항목이 사라졌으면 목록으로 복귀
  }

  const shown = all.filter((e) => filter === "all" || (filter === "manual" ? e.manual : e.auto));

  const filterRow = el("div", { class: "filter-row", role: "group", "aria-label": "단어장 필터" },
    MY_VOCAB_FILTERS.map((f) => el("button", {
      type: "button", class: "filter-chip", text: `${f.label} ${counts[f.id]}`,
      "aria-pressed": String(filter === f.id),
      onClick: () => { state.vocab.filter = f.id; render(false); },
    }))
  );

  const head = el("div", { class: "my-head" }, el("h1", { class: "study-title", text: "내 단어장" }), filterRow);

  if (shown.length === 0) {
    const autoOnly = filter === "auto";
    return el("div", null, head,
      el("div", { class: "empty-state" },
        mascot("think", "mascot-empty"),
        el("h2", { text: autoOnly ? "오답에서 저장된 단어가 없어요." : "아직 저장한 단어가 없어요." }),
        el("p", { text: autoOnly ? "Part 5에서 틀린 문제의 단어가 여기에 모여요." : "단어 공부에서 필요한 단어를 저장해 보세요." }),
        el("button", {
          type: "button", class: "btn btn-secondary", text: "단어 학습으로",
          onClick: () => { state.vocab.mode = "study"; render(true); },
        })
      )
    );
  }

  // 복습 퀴즈: 단어 DB 상세 정보와 한글 뜻이 있는 항목이 4개 이상일 때만 시작 가능
  const canQuiz = eligibleQuizEntries().length >= 4;
  const reviewBox = all.length > 0 && el("div", { class: "review-box" },
    el("h2", { class: "review-title", text: "단어 복습" }),
    el("div", { class: "review-actions" },
      el("button", { type: "button", class: "btn btn-primary", text: "5개 복습", disabled: !canQuiz, onClick: () => startVocabQuiz(5) }),
      el("button", { type: "button", class: "btn btn-primary", text: "10개 복습", disabled: !canQuiz, onClick: () => startVocabQuiz(10) })
    ),
    !canQuiz && el("p", { class: "review-hint", text: "복습 퀴즈를 시작하려면 상세 정보가 있는 단어가 최소 4개 필요해요." })
  );

  return el("div", null, head, reviewBox, el("ul", { class: "my-list" }, shown.map((e) => renderMyVocabItem(e, filter))));
}

function renderMyVocabItem(entry, filter) {
  const v = entry.vocab;
  // 실제 JSON 에 있는 정보만 표시 (없는 뜻/발음/품사는 만들어내지 않음)
  const sub = v ? [v.pronunciationKo, v.partOfSpeech].filter(hasText).join(" · ") : "";
  const meanings = v ? cleanList(v.meaning).join(", ") : "";

  const sources = [
    entry.manual && el("span", { class: "chip", text: "직접 저장" }),
    entry.auto && el("span", { class: "chip is-accent", text: "오답에서 저장" }),
  ];

  // 항목 전체가 "상세 보기"를 여는 버튼 (오른쪽 chevron 으로 눌러볼 수 있음을 표시)
  const open = () => {
    state.vocab.listScroll = mainEl.scrollTop;
    state.vocab.detailKey = entry.key;
    state.vocab.confirmDelete = false;
    render(true);
  };

  const chevron = svgIcon(["m9 6 6 6-6 6"]);
  chevron.setAttribute("class", "my-chevron");

  return el("li", { class: "card my-item" },
    el("button", {
      type: "button", class: "my-open",
      "aria-label": `${v ? v.word : entry.text} 상세 보기`, onClick: open,
    },
      el("span", { class: "my-item-body" },
        el("span", { class: "my-word", lang: "en", text: v ? v.word : entry.text }),
        hasText(sub) && el("span", { class: "my-sub", text: sub }),
        hasText(meanings) && el("span", { class: "my-meaning", text: meanings }),
        !v && el("span", { class: "my-note", text: "Part 5 오답에서 자동 저장" }),
        el("span", { class: "chips" }, sources)
      ),
      chevron
    )
  );
}

// 삭제 범위: "직접 저장" / "오답에서 저장" 필터에서 연 항목은 해당 출처만, "전체"에서 연 항목은 전부 삭제
function deleteScope(entry, filter) {
  if (filter === "manual" && entry.manual) return "manual";
  if (filter === "auto" && entry.auto) return "auto";
  return "all";
}

function removeEntry(entry, scope) {
  if ((scope === "all" || scope === "manual") && entry.manual) removeManualByKey(entry.key);
  if ((scope === "all" || scope === "auto") && entry.auto) removeAutoByKey(entry.key);
}

function renderMyVocabDetail(entry, filter) {
  const v = entry.vocab;
  const name = v ? v.word : entry.text;

  const back = el("button", {
    type: "button", class: "back-btn", text: "← 내 단어장",
    onClick: () => {
      closeVocabDetail();
      render(true);
      mainEl.scrollTop = state.vocab.listScroll; // 목록 위치와 필터(state.vocab.filter) 유지
    },
  });

  const sourceBlock = el("div", null,
    el("h3", { class: "section-label", text: "저장 출처" }),
    el("div", { class: "chips detail-sources" },
      entry.manual && el("span", { class: "chip", text: "직접 저장" }),
      entry.auto && el("span", { class: "chip is-accent", text: "오답에서 저장" })
    )
  );

  // JSON 에 없는 표현은 있는 정보(표현, 출처)만 보여줌
  const card = v
    ? vocabCard(v, null, sourceBlock)
    : el("article", { class: "card vocab-card" },
        el("div", null,
          el("h2", { class: "vocab-word", lang: "en", text: entry.text }),
          el("p", { class: "my-note", text: "Part 5 오답에서 자동 저장" })
        ),
        el("p", { class: "detail-empty", text: "현재 상세 단어 정보가 없어요." }),
        sourceBlock
      );

  // 삭제: 상세 화면 맨 아래의 작은 버튼 + 한 번 더 확인
  const scope = deleteScope(entry, filter);
  let removeArea;
  if (!state.vocab.confirmDelete) {
    removeArea = el("button", {
      type: "button", class: "remove-link", text: "단어장에서 삭제",
      onClick: () => { state.vocab.confirmDelete = true; render(false); },
    });
  } else {
    let message = `"${name}"을(를) 단어장에서 삭제할까요?`;
    if (scope === "manual" && entry.auto) message = `"${name}"의 직접 저장만 해제돼요. 오답에서 저장된 기록은 남아요.`;
    if (scope === "auto" && entry.manual) message = `"${name}"의 오답 저장 기록만 삭제돼요. 직접 저장은 남아요.`;
    removeArea = el("div", { class: "confirm-box", role: "alertdialog", "aria-label": "삭제 확인" },
      el("p", { class: "confirm-text", text: message }),
      el("div", { class: "confirm-actions" },
        el("button", {
          type: "button", class: "btn btn-secondary", text: "취소",
          onClick: () => { state.vocab.confirmDelete = false; render(false); },
        }),
        el("button", {
          type: "button", class: "btn btn-danger", text: "삭제",
          onClick: () => {
            removeEntry(entry, scope);
            closeVocabDetail();
            render(true);
            mainEl.scrollTop = state.vocab.listScroll;
          },
        })
      )
    );
  }

  return el("div", null, back, card, el("div", { class: "remove-area" }, removeArea));
}

/* ---------- 4-c. Part 5 ---------- */

function part5Segmented() {
  const tab = (mode, label) => el("button", {
    type: "button", class: "segmented-btn", text: label,
    "aria-pressed": String(state.notes.mode === mode),
    onClick: () => { state.notes.mode = mode; closeNoteDetail(); render(true); },
  });
  return el("div", { class: "segmented", role: "group", "aria-label": "Part 5 화면 선택" },
    tab("solve", "문제 풀기"), tab("notes", "오답노트"));
}

function closeNoteDetail() {
  state.notes.detailId = null;
  state.notes.confirmDelete = false;
}

function part5SolveIsRoot() {
  const screen = state.part5Hub.screen;
  if (screen === "detail" && state.part5Hub.category) return false;
  if (screen === "normal") return false;
  if (screen === "focused" && state.focusedPart5.active) return false;
  return true;
}

function renderPart5() {
  if (!state.data.part5) return errorView();
  const inNotes = state.notes.mode === "notes";
  const retryOn = inNotes && state.retry.active;
  const body = inNotes ? (retryOn ? renderRetry() : renderWrongNotes()) : renderPart5Solve();
  // 오답 상세/다시 풀기, 유형 상세, 전체 학습, 집중 학습에서는 전환 탭 대신 뒤로가기가 맨 위에 옴
  const showTabs = !(inNotes && (state.notes.detailId || retryOn)) && (inNotes || part5SolveIsRoot());
  return el("section", { class: "view" }, showTabs && part5Segmented(), body);
}

function renderPart5Solve() {
  if (state.part5Hub.screen === "detail" && state.part5Hub.category) return renderCategoryDetail();
  if (state.part5Hub.screen === "normal") return renderNormalStudy();
  if (state.part5Hub.screen === "focused" && state.focusedPart5.active) return renderFocusedPart5();
  state.part5Hub.screen = "select";
  return renderPart5Select();
}

/* ---------- 공용: 완료/결과 화면 ----------
   config: { title, message, stats: [{ value, label }], actions: [{ label, primary, onClick }] }
   단어 복습, 오답 다시 풀기, Part 5 회차 완료 등에서 함께 사용. 위쪽 .complete-visual 에 "트로피 든 한알이"가 들어감. */
function completionView({ title, message, stats = [], actions = [] }) {
  return el("div", { class: "card center-card complete-card" },
    el("div", { class: "complete-visual", "aria-hidden": "true" }, mascot("complete", "mascot-complete mascot-jump")),
    el("h2", { class: "complete-title", text: title }),
    hasText(message) && el("p", { class: "complete-message", text: message }),
    stats.length > 0 && el("div", { class: "complete-stats" },
      stats.map((s) => el("div", { class: "stat-box" },
        el("span", { class: "stat-value", text: s.value }),
        el("span", { class: "stat-label", text: s.label })))),
    el("div", { class: "complete-actions" },
      actions.map((a) => el("button", {
        type: "button", class: "btn btn-block " + (a.primary ? "btn-primary" : "btn-secondary"),
        text: a.label, onClick: a.onClick,
      })))
  );
}

/* ---------- 공용: 선택지 버튼 (Part 5 / 단어 복습 퀴즈) ---------- */
function choiceButton({ letter, text, lang, selected, submitted, isCorrect, onClick }) {
  let cls = "choice";
  let tag = null;
  if (!submitted) {
    if (selected) cls += " is-selected";
  } else if (isCorrect) {
    cls += " is-correct";
    tag = selected ? "✓ 내 선택 · 정답" : "✓ 정답";
  } else if (selected) {
    cls += " is-wrong";
    tag = "✕ 내 선택";
  } else {
    cls += " is-dim";
  }

  return el("button", {
    type: "button", class: cls, disabled: submitted,
    "aria-label": `(${letter}) ${text}`,
    "aria-pressed": !submitted ? String(selected) : null,
    onClick,
  },
    el("span", { class: "choice-letter", "aria-hidden": "true", text: letter }),
    el("span", { class: "choice-text", lang, text }),
    tag && el("span", { class: "choice-tag", text: tag })
  );
}

/* ---------- 공용: 정답/오답 피드백 (Part 5 / 오답 다시 풀기 / 단어 복습 퀴즈) ----------
   작은 한알이 + 메시지. 정답은 살짝 튀어 오르고(mascot-pop), 오답은 부드럽게 기울어짐(mascot-drop) */
function feedbackBox(ok, message) {
  return el("div", { class: "feedback " + (ok ? "is-correct" : "is-wrong"), role: "status" },
    mascot(ok ? "correct" : "wrong", "mascot-feedback " + (ok ? "mascot-pop" : "mascot-drop")),
    el("p", { class: "feedback-text" },
      el("span", { class: "feedback-mark", "aria-hidden": "true", text: ok ? "✓" : "✕" }),
      message
    )
  );
}

/* ---------- 공용: Part 5 문제 화면 (전체 / 유형별 / 오답 다시 풀기) ----------
   cfg: { q, title, current, total, selected, submitted, nextLabel, onSelect, onSubmit, onNext }
   선택 → 정답 확인 → 채점/해설 → 다음 문제 흐름.
   "정답 확인"과 "다음 문제"는 같은 자리(선택지 바로 아래)에 놓이고, 피드백/해설은 그 아래에 붙음.
   버튼 위쪽 요소의 높이가 제출 전후로 바뀌지 않아야 버튼이 움직이지 않음 (헤더 마스코트 자리 유지, 유형 칩은 버튼 아래). */
function renderQuestionScreen(cfg) {
  const { q, selected, submitted } = cfg;
  const correctKey = q.answer;

  // choices 는 { "A": "...", "B": "..." } 형태의 객체
  const choiceEntries = Object.entries(q.choices || {}).filter(([, text]) => hasText(text));
  const choiceButtons = choiceEntries.map(([key, text]) => choiceButton({
    letter: key, text, lang: "en", selected: selected === key, submitted,
    isCorrect: key === correctKey, onClick: () => cfg.onSelect(key),
  }));

  const categoryChips = [q.category, q.subcategory].filter(hasText);

  const questionCard = el("article", { class: "card question-card" },
    el("p", { class: "q-text", lang: "en", text: q.question }),
    el("div", { class: "choices", role: "group", "aria-label": "선택지" }, choiceButtons)
  );

  // 헤더의 작은 "생각하는 한알이"는 제출 후 CSS 로 숨기기만 함 (자리는 유지). 제출 후에는 피드백 박스가 마스코트를 보여줌
  const nodes = [progressHeader(cfg.title, cfg.current, cfg.total, "think"), questionCard];

  const actionBtn = !submitted
    ? el("button", {
        type: "button", class: "btn btn-primary btn-block", text: "정답 확인",
        disabled: selected == null, onClick: cfg.onSubmit,
      })
    : el("button", {
        type: "button", class: "btn btn-primary btn-block", text: cfg.nextLabel, onClick: cfg.onNext,
      });
  nodes.push(el("div", { class: "study-actions" }, actionBtn));

  if (submitted) {
    const ok = selected === correctKey;
    if (categoryChips.length > 0) {
      nodes.push(el("div", { class: "q-category is-after-submit" },
        categoryChips.map((c) => el("span", { class: "chip is-soft", text: c }))));
    }
    nodes.push(feedbackBox(ok, ok ? "정답입니다!" : "아쉽네요. 해설을 확인해 보세요."));
    nodes.push(renderExplanation(q, correctKey));
  }

  return el("div", { class: "p5-question" + (submitted ? " is-submitted" : "") }, nodes);
}

/* ---------- 일반 Part 5 학습 화면 ---------- */
function renderPart5Normal() {
  const s = state.part5;
  const total = part5Index.size;
  const done = completedCount();
  const q = normalCurrentQuestion();

  // 남은 문제가 없으면 처음부터 자동 재시작하지 않고 회차 완료 화면을 보여줌
  if (!q) {
    return completionView({
      title: "Part 5 1회 학습 완료!",
      message: "현재 준비된 문제를 모두 풀었어요.",
      stats: [{ value: `${done} / ${total}`, label: "완료" }],
      actions: [
        { label: "새 회차 시작", primary: true, onClick: startNewCycle },
        { label: "홈으로", onClick: () => go("home") },
      ],
    });
  }

  return renderQuestionScreen({
    q,
    title: "Part 5",
    // 제출 전: 완료 수 + 1번째 문제, 제출 후: 이미 완료에 포함된 수
    current: Math.min(total, done + (s.submitted ? 0 : 1)),
    total,
    selected: s.selected,
    submitted: s.submitted,
    nextLabel: s.index >= s.order.length - 1 ? "학습 마치기" : "다음 문제",
    onSelect: normalSelect,
    onSubmit: normalSubmit,
    onNext: normalNext,
  });
}

/* ---------- Part 5 유형 선택 (문제 풀기 첫 화면) ----------
   대분류/세부 유형은 JSON 의 category, subcategory 를 읽는 순서대로 모읍니다.
   문제 수는 코드에 적지 않고, 불러온 배열에서 계산합니다. */

const PART5_CATEGORY_LABELS = {
  "수일치/대명사": "수일치·대명사",
  "어휘/Collocation": "어휘·Collocation",
};

function part5CategoryLabel(name) {
  return PART5_CATEGORY_LABELS[name] || name;
}

function questionCategory(q) {
  return hasText(q.category) ? q.category.trim() : "";
}

function questionSubcategory(q) {
  return hasText(q.subcategory) ? q.subcategory.trim() : "";
}

// 실제로 문제가 있는 대분류만, JSON 에 처음 나온 순서대로
function part5CategoryCatalog() {
  const order = [];
  const byCat = new Map();
  const seenIds = new Set();
  for (const q of state.data.part5 || []) {
    if (!hasText(q.id) || seenIds.has(q.id) || !part5Index.has(q.id)) continue;
    const category = questionCategory(q);
    if (!category) continue;
    seenIds.add(q.id);
    let cat = byCat.get(category);
    if (!cat) {
      cat = { name: category, ids: [], subs: new Map() };
      byCat.set(category, cat);
      order.push(cat);
    }
    cat.ids.push(q.id);
    const sub = questionSubcategory(q);
    if (!sub) continue;
    if (!cat.subs.has(sub)) cat.subs.set(sub, []);
    cat.subs.get(sub).push(q.id);
  }
  return order.map((cat) => ({
    name: cat.name,
    label: part5CategoryLabel(cat.name),
    total: cat.ids.length,
    done: cat.ids.reduce((n, id) => n + (state.saved.completed.has(id) ? 1 : 0), 0),
    subcategories: [...cat.subs.entries()]
      .filter(([, ids]) => ids.length > 0)
      .map(([name, ids]) => ({ name, total: ids.length })),
  }));
}

function focusedQuestionIds(category, subcategory) {
  const ids = [];
  const seen = new Set();
  for (const q of state.data.part5 || []) {
    if (!hasText(q.id) || seen.has(q.id) || !part5Index.has(q.id)) continue;
    if (questionCategory(q) !== category) continue;
    if (subcategory != null && questionSubcategory(q) !== subcategory) continue;
    seen.add(q.id);
    ids.push(q.id);
  }
  return ids;
}

function resetPart5Browse() {
  state.part5Hub.screen = "select";
  state.part5Hub.category = null;
  state.focusedPart5.active = false;
}

function showPart5Select() {
  resetPart5Browse();
  render(true);
}

function openNormalStudy() {
  state.part5Hub.screen = "normal";
  state.focusedPart5.active = false;
  render(true);
}

function openCategoryDetail(name) {
  state.part5Hub.category = name;
  state.part5Hub.screen = "detail";
  state.focusedPart5.active = false;
  render(true);
}

function startFocused(category, subcategory) {
  const ids = focusedQuestionIds(category, subcategory);
  if (ids.length === 0) return;
  Object.assign(state.focusedPart5, {
    active: true,
    category,
    subcategory: subcategory || null,
    order: shuffle(ids),
    index: 0,
    selected: null,
    submitted: false,
    correct: 0,
    finished: false,
  });
  state.part5Hub.screen = "focused";
  render(true);
}

function p5Chevron() {
  const chevron = svgIcon(["m9 6 6 6-6 6"]);
  chevron.setAttribute("class", "p5-chevron");
  return chevron;
}

function renderPart5Select() {
  const total = part5Index.size;
  const done = completedCount();
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const cats = part5CategoryCatalog();

  const allCard = el("article", { class: "card p5-all-card" },
    el("div", null,
      el("h2", { class: "p5-all-title", text: "전체 문제 풀기" }),
      el("p", { class: "p5-all-desc", text: "모든 유형에서 랜덤으로 학습해요." })
    ),
    el("p", { class: "p5-all-total", text: `${total}문제` }),
    el("p", { class: "p5-all-done" },
      el("strong", { text: String(done) }), ` / ${total} 완료`),
    total > 0 && el("div", {
      class: "progress is-slim", role: "progressbar", "aria-label": "전체 문제 완료",
      "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done),
    }, el("div", { class: "progress-bar", style: `width:${percent}%` })),
    el("button", {
      type: "button", class: "btn btn-accent btn-block", text: "전체 학습 시작",
      onClick: openNormalStudy,
    })
  );

  return el("div", { class: "p5-select" },
    el("div", { class: "p5-intro" },
      el("div", { class: "p5-intro-copy" },
        el("span", { class: "eyebrow", text: "Part 5" }),
        el("h1", { class: "p5-intro-title", text: "오늘 집중할 유형을 골라보세요." })
      ),
      el("div", { class: "p5-intro-art" }, mascot("think", "mascot-hub"))
    ),
    allCard,
    el("div", { class: "p5-block" },
      el("h2", { class: "block-title", id: "p5-cat-heading", text: "유형별 학습" }),
      el("ul", { class: "p5-cat-grid", "aria-labelledby": "p5-cat-heading" },
        cats.map((cat) => el("li", null, categoryButton(cat))))
    )
  );
}

function categoryButton(cat) {
  return el("button", {
    type: "button", class: "p5-cat-card",
    "aria-label": `${cat.label}, ${cat.total}문제, ${cat.done} / ${cat.total} 완료`,
    onClick: () => openCategoryDetail(cat.name),
  },
    el("span", { class: "p5-cat-text" },
      el("span", { class: "p5-cat-name", text: cat.label }),
      el("span", { class: "p5-cat-count", text: `${cat.total}문제` }),
      el("span", { class: "p5-cat-done" },
        el("strong", { text: String(cat.done) }), ` / ${cat.total} 완료`)
    ),
    p5Chevron()
  );
}

function renderCategoryDetail() {
  const cat = part5CategoryCatalog().find((c) => c.name === state.part5Hub.category);
  if (!cat) {
    state.part5Hub.screen = "select";
    state.part5Hub.category = null;
    return renderPart5Select();
  }

  const subs = cat.subcategories;
  return el("div", { class: "p5-detail" },
    el("button", { type: "button", class: "back-btn", text: "← Part 5", onClick: showPart5Select }),
    el("div", { class: "p5-detail-head" },
      el("h1", { class: "p5-detail-title", text: cat.label }),
      el("p", { class: "p5-detail-count", text: `${cat.total}문제` })
    ),
    el("button", {
      type: "button", class: "p5-focus-card",
      "aria-label": `전체 ${cat.label} 풀기, ${cat.total}문제`,
      onClick: () => startFocused(cat.name, null),
    },
      el("span", { class: "p5-focus-copy" },
        el("span", { class: "p5-focus-title", text: `전체 ${cat.label} 풀기` }),
        el("span", { class: "p5-focus-desc", text: "이 유형의 문제를 랜덤으로 풀어요." })
      ),
      el("span", { class: "p5-focus-count", text: `${cat.total}문제` })
    ),
    subs.length > 0 && el("div", { class: "p5-block" },
      el("h2", { class: "block-title", id: "p5-sub-heading", text: "세부 유형" }),
      el("ul", { class: "p5-sub-list", "aria-labelledby": "p5-sub-heading" },
        subs.map((sub) => el("li", null, subcategoryButton(cat, sub))))
    )
  );
}

function subcategoryButton(cat, sub) {
  return el("button", {
    type: "button", class: "p5-sub-card",
    "aria-label": `${sub.name}, ${sub.total}문제`,
    onClick: () => startFocused(cat.name, sub.name),
  },
    el("span", { class: "p5-sub-name", text: sub.name }),
    el("span", { class: "p5-sub-count", text: `${sub.total}문제` }),
    p5Chevron()
  );
}

function renderNormalStudy() {
  return el("div", null,
    el("button", { type: "button", class: "back-btn", text: "← 유형 선택", onClick: showPart5Select }),
    renderPart5Normal()
  );
}

function focusedStudyTitle(f) {
  return f.subcategory ? f.subcategory : part5CategoryLabel(f.category);
}

function focusedCurrentQuestion() {
  const id = state.focusedPart5.order[state.focusedPart5.index];
  return id ? part5Index.get(id) || null : null;
}

function renderFocusedPart5() {
  const f = state.focusedPart5;
  if (f.finished) return renderFocusedResult(f);
  const q = focusedCurrentQuestion();
  if (!q) {
    f.finished = true;
    return renderFocusedResult(f);
  }
  return el("div", { class: "p5-focused" },
    el("button", { type: "button", class: "back-btn", text: "← 유형 선택", onClick: showPart5Select }),
    renderQuestionScreen({
      q,
      title: focusedStudyTitle(f),
      current: f.index + 1,
      total: f.order.length,
      selected: f.selected,
      submitted: f.submitted,
      nextLabel: f.index >= f.order.length - 1 ? "학습 마치기" : "다음 문제",
      onSelect: focusedSelect,
      onSubmit: focusedSubmit,
      onNext: focusedNext,
    })
  );
}

function renderFocusedResult(f) {
  const total = f.order.length;
  const percent = total > 0 ? Math.round((f.correct / total) * 100) : 0;
  return el("div", { class: "p5-focused-result" },
    completionView({
      title: `${focusedStudyTitle(f)} 학습 완료!`,
      message: `${total}문제 중 ${f.correct}문제를 맞혔어요.`,
      stats: [
        { value: String(f.correct), label: "정답" },
        { value: String(total), label: "전체" },
        { value: `${percent}%`, label: "정답률" },
      ],
      actions: [
        { label: "같은 유형 다시 풀기", primary: true, onClick: () => startFocused(f.category, f.subcategory) },
        { label: "유형 선택으로", onClick: showPart5Select },
      ],
    })
  );
}

/* ---------- 오답 다시 풀기 화면 ---------- */
function renderRetry() {
  const r = state.retry;
  const total = r.order.length;

  if (r.finished) {
    const percent = total > 0 ? Math.round((r.correct / total) * 100) : 0;
    return completionView({
      title: "오답 복습 완료!",
      message: `${total}문제 중 ${r.correct}문제를 맞혔어요.`,
      stats: [
        { value: String(r.correct), label: "정답" },
        { value: String(total), label: "전체" },
        { value: `${percent}%`, label: "정답률" },
      ],
      actions: [
        { label: "다시 복습하기", primary: true, onClick: startRetry },
        { label: "오답노트로", onClick: exitRetry },
      ],
    });
  }

  const q = part5Index.get(r.order[r.index]);
  if (!q) { r.active = false; return renderWrongNotes(); }

  const back = el("button", { type: "button", class: "back-btn", text: "← 오답노트", onClick: exitRetry });
  return el("div", null,
    back,
    renderQuestionScreen({
      q,
      title: "오답 다시 풀기",
      current: r.index + 1,
      total,
      selected: r.selected,
      submitted: r.submitted,
      nextLabel: r.index >= total - 1 ? "학습 마치기" : "다음 문제",
      onSelect: retrySelect,
      onSubmit: retrySubmit,
      onNext: retryNext,
    })
  );
}

/* ---------- 4-d. Part 5 오답노트 ---------- */

function renderWrongNotes() {
  // 기록(userstate) + 문제 JSON 을 questionId 로 연결. JSON 에서 사라진 문제는 기록은 남기고 화면에서만 숨김
  const items = state.saved.wrongNotes
    .map((note) => ({ note, q: part5Index.get(note.questionId) }))
    .filter((it) => it.q)
    .sort((a, b) => b.note.lastWrongAt - a.note.lastWrongAt);

  if (state.notes.detailId) {
    const found = items.find((it) => it.note.questionId === state.notes.detailId);
    if (found) return renderWrongNoteDetail(found.note, found.q);
    closeNoteDetail(); // 삭제되었거나 없는 문제면 목록으로 복귀
  }

  const head = el("div", { class: "my-head" },
    el("h1", { class: "study-title", text: "오답노트" }),
    items.length > 0 && el("p", { class: "note-total", text: `틀린 문제 ${items.length}개` }),
    items.length > 0 && el("button", {
      type: "button", class: "btn btn-primary btn-block", text: "오답 다시 풀기", onClick: startRetry,
    })
  );

  if (items.length === 0) {
    return el("div", null, head,
      el("div", { class: "empty-state" },
        mascot("default", "mascot-empty"),
        el("h2", { text: "아직 틀린 문제가 없어요." }),
        el("p", { text: "Part 5에서 틀린 문제가 여기에 모여요." }),
        el("button", {
          type: "button", class: "btn btn-secondary", text: "문제 풀기",
          onClick: () => { state.notes.mode = "solve"; render(true); },
        })
      )
    );
  }

  return el("div", null, head,
    el("ul", { class: "my-list" }, items.map((it) => renderWrongNoteItem(it.note, it.q))));
}

function renderWrongNoteItem(note, q) {
  const open = () => {
    state.notes.listScroll = mainEl.scrollTop;
    state.notes.detailId = note.questionId;
    state.notes.confirmDelete = false;
    render(true);
  };

  const chevron = svgIcon(["m9 6 6 6-6 6"]);
  chevron.setAttribute("class", "my-chevron");

  return el("li", { class: "card my-item" },
    el("button", {
      type: "button", class: "my-open",
      "aria-label": `${q.id} 오답 상세 보기`, onClick: open,
    },
      el("span", { class: "my-item-body" },
        el("span", { class: "note-id", text: q.id }),
        el("span", { class: "note-q", lang: "en", text: q.question }),
        el("span", { class: "chips" },
          hasText(q.category) && el("span", { class: "chip is-soft", text: q.category }),
          hasText(q.subcategory) && el("span", { class: "chip is-soft", text: q.subcategory }),
          el("span", { class: "chip is-accent", text: `틀린 횟수 ${note.wrongCount}회` })
        )
      ),
      chevron
    )
  );
}

function renderWrongNoteDetail(note, q) {
  const correctKey = q.answer;
  const mine = note.selectedAnswer;

  const back = el("button", {
    type: "button", class: "back-btn", text: "← 오답노트",
    onClick: () => {
      closeNoteDetail();
      render(true);
      mainEl.scrollTop = state.notes.listScroll;
    },
  });

  const choiceEntries = Object.entries(q.choices || {}).filter(([, text]) => hasText(text));
  const choiceRows = choiceEntries.map(([key, text]) => {
    const isCorrect = key === correctKey;
    const isMine = key === mine;
    let cls = "choice is-static";
    let tag = null;
    if (isCorrect) { cls += " is-correct"; tag = isMine ? "✓ 내 선택 · 정답" : "✓ 정답"; }
    else if (isMine) { cls += " is-wrong"; tag = "✕ 내 선택"; }
    return el("div", { class: cls },
      el("span", { class: "choice-letter", text: key }),
      el("span", { class: "choice-text", lang: "en", text }),
      tag && el("span", { class: "choice-tag", text: tag })
    );
  });

  const mineText = mine && q.choices && hasText(q.choices[mine]) ? ` ${q.choices[mine]}` : "";

  const questionCard = el("article", { class: "card question-card" },
    el("div", { class: "q-category" },
      hasText(q.category) && el("span", { class: "chip is-soft", text: q.category }),
      hasText(q.subcategory) && el("span", { class: "chip is-soft", text: q.subcategory }),
      el("span", { class: "chip is-accent", text: `틀린 횟수 ${note.wrongCount}회` })
    ),
    el("p", { class: "q-text", lang: "en", text: q.question }),
    el("div", { class: "choices" }, choiceRows),
    hasText(mine) && el("div", { class: "explain-block my-choice-line" },
      el("h3", { text: "내가 선택한 답" }),
      el("p", { class: "my-choice-text", lang: "en", text: `(${mine})${mineText}` })
    )
  );

  // 삭제: 오답노트 기록만 제거 (내 단어장은 그대로)
  let removeArea;
  if (!state.notes.confirmDelete) {
    removeArea = el("button", {
      type: "button", class: "remove-link", text: "오답노트에서 삭제",
      onClick: () => { state.notes.confirmDelete = true; render(false); },
    });
  } else {
    removeArea = el("div", { class: "confirm-box", role: "alertdialog", "aria-label": "삭제 확인" },
      el("p", { class: "confirm-text", text: "이 문제를 오답노트에서 삭제할까요? 내 단어장의 단어는 그대로 남아요." }),
      el("div", { class: "confirm-actions" },
        el("button", {
          type: "button", class: "btn btn-secondary", text: "취소",
          onClick: () => { state.notes.confirmDelete = false; render(false); },
        }),
        el("button", {
          type: "button", class: "btn btn-danger", text: "삭제",
          onClick: () => {
            removeWrongNote(note.questionId);
            closeNoteDetail();
            render(true);
            mainEl.scrollTop = state.notes.listScroll;
          },
        })
      )
    );
  }

  return el("div", null,
    back,
    questionCard,
    renderExplanation(q, correctKey),
    el("div", { class: "remove-area" }, removeArea)
  );
}

function renderExplanation(q, correctKey) {
  const correctText = q.choices && q.choices[correctKey];
  const choiceExp = Object.entries(q.choiceExplanations || {}).filter(([, t]) => hasText(t));

  return el("article", { class: "card explain-card" },
    hasText(correctKey) && el("div", { class: "explain-block" },
      el("h3", { text: "정답" }),
      el("p", { class: "explain-answer", lang: "en", text: `(${correctKey})${hasText(correctText) ? " " + correctText : ""}` })
    ),
    hasText(q.keyPoint) && el("div", { class: "explain-block" },
      el("h3", { text: "핵심 포인트" }), el("p", { text: q.keyPoint })),
    hasText(q.explanation) && el("div", { class: "explain-block" },
      el("h3", { text: "해설" }), el("p", { text: q.explanation })),
    choiceExp.length > 0 && el("div", { class: "explain-block" },
      el("h3", { text: "선택지 해설" }),
      el("ul", { class: "explain-choices" },
        choiceExp.map(([key, text]) => el("li", null, el("b", { text: `(${key}) ` }), text)))
    )
  );
}

/* ---------- 4-e. 일반 Part 5 학습 (완료 기록 / 랜덤 회차) ---------- */

// 섞인 새 배열을 반환 (Fisher-Yates)
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function persistCompleted() { writeStored(STORAGE_KEYS.completed, [...state.saved.completed]); }
function persistSession() {
  writeStored(STORAGE_KEYS.session, { order: state.part5.order, index: state.part5.index });
}

// 현재 문제 JSON 에 존재하는 완료 문제 수
function completedCount() {
  let n = 0;
  for (const id of state.saved.completed) if (part5Index.has(id)) n += 1;
  return n;
}

// 저장된 세션을 복원: 현재 위치부터의 남은 순서를 유지하고, 이미 완료한 문제/사라진 문제/중복은 제거,
// 순서에 없는 미완료 문제(예: 새로 추가된 문제)는 섞어서 뒤에 붙인다.
function restoreNormalSession() {
  const s = state.part5;
  const queue = [];
  const seen = new Set();
  const take = (id) => {
    if (seen.has(id) || !part5Index.has(id) || state.saved.completed.has(id)) return;
    seen.add(id);
    queue.push(id);
  };
  s.order.slice(Math.max(0, s.index)).forEach(take);
  shuffle([...part5Index.keys()]).forEach(take);
  s.order = queue;
  s.index = 0;
  s.selected = null;
  s.submitted = false;
  persistSession();
}

function normalCurrentQuestion() {
  const s = state.part5;
  const id = s.order[s.index];
  return id ? part5Index.get(id) || null : null;
}

// "새 회차 시작": 일반 학습의 완료 기록/세션만 초기화. 오답노트, wrongCount, 내 단어장은 건드리지 않음
function startNewCycle() {
  state.saved.completed = new Set();
  persistCompleted();
  const s = state.part5;
  s.order = shuffle([...part5Index.keys()]);
  s.index = 0;
  s.selected = null;
  s.submitted = false;
  persistSession();
  render(true);
}

function scrollToFeedback() {
  const fb = mainEl.querySelector(".feedback");
  if (fb) fb.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function normalSelect(key) {
  if (state.part5.submitted) return; // 제출 후에는 변경 불가
  state.part5.selected = key;
  render(false);
}

function normalSubmit() {
  const s = state.part5;
  const q = normalCurrentQuestion();
  if (!q || s.submitted || s.selected == null) return;
  s.submitted = true;

  // 제출하는 순간 "완료" 처리 (정답/오답 무관)
  try {
    state.saved.completed.add(q.id);
    persistCompleted();
  } catch (err) {
    console.error("[토익한알] 완료 기록 저장 중 오류", err);
  }

  // 오답일 때만 두 가지를 서로 독립적으로 수행 (선택만 한 상태에서는 저장하지 않음)
  if (s.selected !== q.answer) {
    // A) 오답노트에 문제 기록
    try {
      recordWrongNote(q, s.selected);
    } catch (err) {
      console.error("[토익한알] 오답노트 저장 중 오류", err);
    }
    // B) q.reviewVocabulary 로 핵심 단어를 내 단어장(자동 저장)에 수집
    try {
      collectWrongAnswerVocab(q);
    } catch (err) {
      console.error("[토익한알] 오답 단어 자동 저장 중 오류", err);
    }
  }

  render(false);
}

function normalNext() {
  const s = state.part5;
  if (!s.submitted) return;
  s.index += 1; // 마지막 문제였다면 order 끝을 넘어가 "회차 완료" 화면이 표시됨
  s.selected = null;
  s.submitted = false;
  persistSession();
  render(true);
}

// 집중 학습에서 새로 완료된 문제만 일반 회차 대기열에서 빼서, 같은 문제를 전체 학습에서 다시 내지 않음.
// 이미 지나간 순서는 유지하고, 오답노트/단어장/완료 Set 자체는 여기서 지우지 않음.
function removeCompletedFromNormalQueue(id) {
  const s = state.part5;
  const currentId = s.order[s.index];
  const next = [];
  let index = s.index;
  let removed = false;
  for (let i = 0; i < s.order.length; i++) {
    if (s.order[i] === id) {
      removed = true;
      if (i < s.index) index -= 1;
      continue;
    }
    next.push(s.order[i]);
  }
  if (!removed) return;
  s.order = next;
  if (index < 0) index = 0;
  if (index > next.length) index = next.length;
  s.index = index;
  if (currentId === id) {
    s.selected = null;
    s.submitted = false;
  }
  persistSession();
}

function focusedSelect(key) {
  if (state.focusedPart5.submitted) return;
  state.focusedPart5.selected = key;
  render(false);
}

function focusedSubmit() {
  const f = state.focusedPart5;
  const q = focusedCurrentQuestion();
  if (!q || f.submitted || f.selected == null) return;
  f.submitted = true;
  if (f.selected === q.answer) f.correct += 1;

  // 전역 완료 Set 에 없을 때만 추가. 이미 완료된 문제는 중복 기록하지 않음.
  // 새로 완료되면 일반 100문제 회차도 함께 진행됨.
  try {
    if (!state.saved.completed.has(q.id)) {
      state.saved.completed.add(q.id);
      persistCompleted();
      removeCompletedFromNormalQueue(q.id);
    }
  } catch (err) {
    console.error("[토익한알] 완료 기록 저장 중 오류", err);
  }

  if (f.selected !== q.answer) {
    try {
      recordWrongNote(q, f.selected);
    } catch (err) {
      console.error("[토익한알] 오답노트 저장 중 오류", err);
    }
    try {
      collectWrongAnswerVocab(q);
    } catch (err) {
      console.error("[토익한알] 오답 단어 자동 저장 중 오류", err);
    }
  }

  render(false);
}

function focusedNext() {
  const f = state.focusedPart5;
  if (!f.submitted) return;
  if (f.index >= f.order.length - 1) {
    f.finished = true;
  } else {
    f.index += 1;
    f.selected = null;
    f.submitted = false;
  }
  render(true);
}

/* ---------- 4-f. 오답 다시 풀기 (연습 전용: 완료 기록/wrongCount/오답노트를 바꾸지 않음) ---------- */

function startRetry() {
  const ids = state.saved.wrongNotes.map((n) => n.questionId).filter((id) => part5Index.has(id));
  if (ids.length === 0) return;
  Object.assign(state.retry, {
    active: true, order: shuffle(ids), index: 0, selected: null, submitted: false, correct: 0, finished: false,
  });
  render(true);
}

function exitRetry() {
  state.retry.active = false;
  render(true);
}

function retrySelect(key) {
  if (state.retry.submitted) return;
  state.retry.selected = key;
  render(false);
}

function retrySubmit() {
  const r = state.retry;
  const q = part5Index.get(r.order[r.index]);
  if (!q || r.submitted || r.selected == null) return;
  r.submitted = true;
  if (r.selected === q.answer) r.correct += 1; // 세션 점수만 기록
  render(false);
}

function retryNext() {
  const r = state.retry;
  if (!r.submitted) return;
  if (r.index >= r.order.length - 1) {
    r.finished = true;
  } else {
    r.index += 1;
    r.selected = null;
    r.submitted = false;
  }
  render(true);
}

/* ---------- 4-g. 단어 복습 퀴즈 (영어 → 한글 뜻 4지선다, 세션 점수만 사용) ---------- */

function firstMeaning(vocab) {
  const m = vocab ? cleanList(vocab.meaning)[0] : null;
  return m ? m.trim() : null;
}

// 내 단어장(통합 목록)에서 단어 DB 정보와 한글 뜻이 모두 있는 항목만 퀴즈 대상
function eligibleQuizEntries() {
  return buildMyVocabList().filter((e) => e.vocab && firstMeaning(e.vocab));
}

// 보기 1개 + 오답 3개 생성. 오답은 단어 DB 의 실제 항목에서만 뽑고, 한글 뜻이 겹치지 않게 한다.
function buildQuizQuestion(target) {
  const correct = firstMeaning(target);
  const used = new Set([normalize(correct), ...cleanList(target.meaning).map(normalize)]);
  const pool = shuffle((state.data.vocab || []).filter((v) =>
    v.id !== target.id && normalize(v.word) !== normalize(target.word) && firstMeaning(v)));
  // 품사가 같은 항목을 먼저 (너무 쉽게 소거되지 않도록), 그다음 나머지
  const ordered = [
    ...pool.filter((v) => v.partOfSpeech === target.partOfSpeech),
    ...pool.filter((v) => v.partOfSpeech !== target.partOfSpeech),
  ];
  const distractors = [];
  for (const v of ordered) {
    const m = firstMeaning(v);
    const key = normalize(m);
    if (used.has(key)) continue;
    used.add(key);
    distractors.push(m);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return null;

  const choices = shuffle([correct, ...distractors]);
  return { vocabId: target.id, word: target.word, choices, answerIndex: choices.indexOf(correct) };
}

function startVocabQuiz(count) {
  const eligible = eligibleQuizEntries();
  if (eligible.length < 4) return; // 4지선다를 만들 수 없으면 시작하지 않음
  const questions = [];
  for (const entry of shuffle(eligible)) { // 한 세션에서 같은 단어가 두 번 나오지 않음
    if (questions.length >= count) break;
    const q = buildQuizQuestion(entry.vocab);
    if (q) questions.push(q);
  }
  if (questions.length === 0) {
    console.error("[토익한알] 복습 퀴즈 문제를 만들지 못했습니다.");
    return;
  }
  Object.assign(state.vquiz, {
    active: true, count, questions, index: 0, selected: null, submitted: false, correct: 0, finished: false,
  });
  render(true);
}

function exitVocabQuiz() {
  state.vquiz.active = false;
  render(true);
}

function vquizSelect(i) {
  if (state.vquiz.submitted) return;
  state.vquiz.selected = i;
  render(false);
}

function vquizSubmit() {
  const v = state.vquiz;
  const q = v.questions[v.index];
  if (!q || v.submitted || v.selected == null) return;
  v.submitted = true;
  if (v.selected === q.answerIndex) v.correct += 1;
  render(false);
  scrollToFeedback();
}

function vquizNext() {
  const v = state.vquiz;
  if (!v.submitted) return;
  if (v.index >= v.questions.length - 1) {
    v.finished = true;
  } else {
    v.index += 1;
    v.selected = null;
    v.submitted = false;
  }
  render(true);
}

function renderVocabQuiz() {
  const v = state.vquiz;
  const total = v.questions.length;

  if (v.finished) {
    const percent = total > 0 ? Math.round((v.correct / total) * 100) : 0;
    return completionView({
      title: "단어 복습 완료!",
      message: `${total}문제 중 ${v.correct}문제를 맞혔어요.`,
      stats: [
        { value: String(v.correct), label: "정답" },
        { value: String(total), label: "전체" },
        { value: `${percent}%`, label: "정답률" },
      ],
      actions: [
        { label: "다시 복습하기", primary: true, onClick: () => startVocabQuiz(v.count) },
        { label: "내 단어장으로", onClick: exitVocabQuiz },
      ],
    });
  }

  const q = v.questions[v.index];
  const back = el("button", { type: "button", class: "back-btn", text: "← 내 단어장", onClick: exitVocabQuiz });

  const buttons = q.choices.map((text, i) => choiceButton({
    letter: "ABCD"[i], text, selected: v.selected === i, submitted: v.submitted,
    isCorrect: i === q.answerIndex, onClick: () => vquizSelect(i),
  }));

  const card = el("article", { class: "card question-card" },
    el("h3", { class: "section-label", text: "이 단어(표현)의 뜻은?" }),
    el("p", { class: "vocab-word" + (q.word.length > 16 ? " is-long" : ""), lang: "en", text: q.word }),
    el("div", { class: "choices", role: "group", "aria-label": "뜻 선택지" }, buttons)
  );

  const nodes = [back, progressHeader("단어 복습", v.index + 1, total), card];

  if (v.submitted) {
    const ok = v.selected === q.answerIndex;
    nodes.push(feedbackBox(ok, ok ? "정답입니다!" : `아쉽네요. 정답은 "${q.choices[q.answerIndex]}"예요.`));
  }

  const isLast = v.index === total - 1;
  const actionBtn = !v.submitted
    ? el("button", {
        type: "button", class: "btn btn-primary btn-block", text: "제출하기",
        disabled: v.selected == null, onClick: vquizSubmit,
      })
    : el("button", {
        type: "button", class: "btn btn-primary btn-block", text: isLast ? "결과 보기" : "다음", onClick: vquizNext,
      });
  nodes.push(el("div", { class: "study-actions" + (v.submitted ? " is-inline" : "") }, actionBtn));

  return el("div", null, nodes);
}

/* ---------- 4-e. 성적표 분석기 Beta ----------
   TOEIC L&R 성적표의 "Abilities Measured" 백분율 10개를 직접 입력받아 분석합니다.
   (OCR / 이미지 업로드 / 외부 AI API 없음. 모든 계산은 브라우저 안에서 규칙대로 이뤄집니다.)

   흐름:  ABILITIES(메타데이터) → parseScore/validateAllScores(검증) → analyzeScores(순수 계산)
          → commentaryEngine(규칙 기반 해설) → renderAnalysis*(화면)
   - commentaryEngine 은 analyzeScores 결과 객체만 받아 { headline, summary, priorities } 를 돌려주는 함수입니다.
     나중에 AI 해설로 바꾸거나 덧붙일 때 이 함수만 교체하면 입력/결과 화면은 그대로 쓸 수 있습니다.
   - 입력값과 결과는 메모리(state.analysis)에만 있고 localStorage 에는 저장하지 않습니다. */

const ABILITY_SECTIONS = [
  { key: "listening", code: "LC", title: "Listening" },
  { key: "reading", code: "RC", title: "Reading" },
];

// 10개 능력의 메타데이터. 화면에 보이는 이름/조언은 모두 여기서만 가져옵니다. (percentage 는 입력값이라 여기에 없음)
//  shortLabel : 입력 칸과 막대 그래프의 이름   fullLabel : 요약 카드의 이름 (LC/RC 표시 포함)
//  weakComment: 이 능력이 상대적으로 낮을 때의 해설   studyAdvice: 한 줄 학습 팁
//  appHint    : 토익한알에 이미 있는 학습 기능과 연결될 때만 (없으면 생략)
const ABILITIES = [
  {
    id: "L1", section: "listening", shortLabel: "짧은 음성의 요지·목적·맥락", fullLabel: "LC 짧은 음성의 요지·목적·맥락",
    weakComment: "짧은 음성에서 전체 상황이나 말하는 목적을 파악하는 부분이 상대적으로 아쉬워요. 첫 한두 문장에서 누가, 어디서, 왜 말하는지 먼저 잡는 연습이 도움이 돼요.",
    studyAdvice: "첫 문장에서 화자·장소·목적을 먼저 잡아 보세요.",
  },
  {
    id: "L2", section: "listening", shortLabel: "긴 음성의 요지·목적·맥락", fullLabel: "LC 긴 음성의 요지·목적·맥락",
    weakComment: "긴 대화나 담화의 흐름을 따라가며 주제와 목적을 파악하는 힘이 더 필요해요. 문제를 먼저 읽고 핵심어를 표시한 뒤 들으면 흐름을 놓치지 않기 쉬워요.",
    studyAdvice: "문제를 먼저 읽고 핵심어를 표시한 뒤 들어 보세요.",
  },
  {
    id: "L3", section: "listening", shortLabel: "짧은 음성의 세부정보", fullLabel: "LC 짧은 음성의 세부정보",
    weakComment: "짧은 음성에서 숫자, 시간, 장소 같은 세부정보를 놓치는 경우가 있어 보여요. 핵심 정보를 짧게 메모하고, 같은 뜻을 바꿔 말한 보기를 찾는 연습을 해 보세요.",
    studyAdvice: "숫자·시간·장소를 메모하고 바꿔 말한 보기를 찾아 보세요.",
  },
  {
    id: "L4", section: "listening", shortLabel: "긴 음성의 세부정보", fullLabel: "LC 긴 음성의 세부정보",
    weakComment: "긴 음성의 세부정보를 끝까지 기억하며 고르는 연습이 필요해요. 정답 단서가 문제 순서대로 나오는 흐름을 의식하며 들어 보세요.",
    studyAdvice: "정답 단서가 문제 순서대로 나오는 흐름을 따라가며 들어 보세요.",
  },
  {
    id: "L5", section: "listening", shortLabel: "화자의 의도·암시", fullLabel: "LC 화자의 의도·암시",
    weakComment: "화자의 의도나 직접 말하지 않은 의미를 파악하는 연습이 필요해요. 말투와 앞뒤 맥락을 함께 보고 ‘왜 이렇게 말했을까’를 생각해 보세요.",
    studyAdvice: "말투와 앞뒤 맥락에서 ‘왜 그렇게 말했는지’ 생각해 보세요.",
  },
  {
    id: "R1", section: "reading", shortLabel: "특정 정보 찾기", fullLabel: "RC 특정 정보 찾기",
    weakComment: "지문에서 필요한 정보를 빠르게 찾아내는 연습이 필요해 보여요. 질문의 핵심어를 먼저 잡고 지문에서 해당 부분만 찾아 읽는 습관을 들여 보세요.",
    studyAdvice: "질문의 핵심어를 먼저 잡고 지문에서 해당 부분만 찾아 읽어 보세요.",
  },
  {
    id: "R2", section: "reading", shortLabel: "여러 문장·지문의 정보 연결", fullLabel: "RC 여러 문장·지문의 정보 연결",
    weakComment: "여러 문장이나 지문의 정보를 연결하는 문제가 상대적으로 약해요. Part 7 연계 문제를 중심으로 연습하는 것이 좋아요.",
    studyAdvice: "지문 사이를 잇는 단서(날짜·이름·숫자)를 표시하며 풀어 보세요.",
  },
  {
    id: "R3", section: "reading", shortLabel: "추론", fullLabel: "RC 추론",
    weakComment: "직접 쓰여 있지 않은 내용을 판단하는 추론 문제가 약점으로 보여요. 근거가 되는 문장을 지문에서 먼저 찾고, 그 근거로 확실히 말할 수 있는 보기만 고르는 연습을 해 보세요.",
    studyAdvice: "근거 문장을 먼저 찾고, 근거로 확실히 말할 수 있는 보기만 고르세요.",
  },
  {
    id: "R4", section: "reading", shortLabel: "어휘", fullLabel: "RC 어휘",
    weakComment: "어휘 이해가 독해 점수에 영향을 주고 있어요. 단어 학습과 문맥 속 의미 구별을 우선해 보세요.",
    studyAdvice: "단어를 뜻만이 아니라 문맥 속 쓰임으로 함께 익혀 보세요.",
    appHint: "토익한알의 ‘단어’ 탭에서 단어 학습을 이어가 보세요.",
  },
  {
    id: "R5", section: "reading", shortLabel: "문법", fullLabel: "RC 문법",
    weakComment: "문법 영역을 먼저 보완하면 Part 5와 Part 6에서 안정적으로 점수를 확보하는 데 도움이 될 수 있어요.",
    studyAdvice: "품사 자리·시제·수 일치처럼 자주 나오는 유형을 반복해서 풀어 보세요.",
    appHint: "토익한알의 ‘Part 5’ 탭에서 문법·어휘 문제를 풀어 보세요.",
  },
];

// 토익한알 분석 기준 (ETS 공식 등급이 아님). 위에서부터 처음 맞는 단계를 사용합니다.
const DIAGNOSTIC_LEVELS = [
  { min: 95, key: "top", label: "매우 강함" },
  { min: 90, key: "steady", label: "안정적" },
  { min: 85, key: "improve", label: "보완 권장" },
  { min: 0, key: "priority", label: "우선 보완" },
];

// 예상 오답 범위(참고용): 구간 평균으로 중심값을 구하고, 아래 오차를 앞뒤로 둡니다. 공식 환산식이 아닙니다.
const WRONG_ESTIMATE = {
  questions: 100,       // 구간(LC/RC)당 문항 수 — 표시 범위의 상한
  baseMargin: 4,        // 기본 오차 (±4문항)
  spreadThreshold: 10,  // 5개 백분율의 최고-최저 차이가 이 값 이상이면
  spreadExtraMargin: 2, //   능력별 편차가 커서 평균의 의미가 줄어드므로 오차를 이만큼 더 넓힘
};

const SCORE_MESSAGES = {
  empty: "값을 입력해 주세요.",
  notNumber: "숫자만 입력할 수 있어요. (예: 87)",
  outOfRange: "0부터 100 사이의 값을 입력해 주세요.",
};

function diagnosticLevel(percentage) {
  return DIAGNOSTIC_LEVELS.find((l) => percentage >= l.min) || DIAGNOSTIC_LEVELS[DIAGNOSTIC_LEVELS.length - 1];
}

function abilitySection(key) {
  return ABILITY_SECTIONS.find((s) => s.key === key);
}

// 입력 한 칸 검사. 범위를 벗어난 값을 고쳐 주지 않고(클램프 없음) 이유와 함께 거절합니다.
// 끝에 붙은 "%" 만 허용(예: "87%")하고 나머지 숫자가 아닌 입력은 모두 거절합니다.
function parseScore(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/%$/, "").trim();
  if (text === "") return { ok: false, message: SCORE_MESSAGES.empty };
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, message: SCORE_MESSAGES.notNumber };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, message: SCORE_MESSAGES.notNumber };
  if (n < 0 || n > 100) return { ok: false, message: SCORE_MESSAGES.outOfRange };
  return { ok: true, value: n };
}

// 10칸 모두 검사. valid 일 때만 분석에 들어갈 수 있음
function validateAllScores(values) {
  const errors = {};
  const numbers = {};
  for (const a of ABILITIES) {
    const r = parseScore(values[a.id]);
    if (r.ok) numbers[a.id] = r.value;
    else errors[a.id] = r.message;
  }
  return { errors, numbers, valid: Object.keys(errors).length === 0 };
}

function fmtNumber(n, digits) {
  const f = Math.pow(10, digits);
  return String(Math.round(n * f) / f);
}
const fmtPct = (n) => fmtNumber(n, 2);
const fmtIndex = (n) => fmtNumber(n, 1);

function average(list) {
  return list.reduce((s, n) => s + n, 0) / list.length;
}

// 예상 오답 범위. center = round(100 - 평균), 범위 = center ± margin 을 0~100 으로 제한
function estimateWrongRange(percentages) {
  const mean = average(percentages);
  const spread = Math.max(...percentages) - Math.min(...percentages);
  const margin = WRONG_ESTIMATE.baseMargin + (spread >= WRONG_ESTIMATE.spreadThreshold ? WRONG_ESTIMATE.spreadExtraMargin : 0);
  const center = Math.round(100 - mean);
  const clamp = (n) => Math.max(0, Math.min(WRONG_ESTIMATE.questions, n));
  return { center, margin, spread, low: clamp(center - margin), high: clamp(center + margin) };
}

// 순수 계산: 검증을 통과한 숫자({L1: 100, ...})로 강약점/순위/진단 지수/예상 오답을 만듦.
// 동점은 항상 ABILITIES 의 순서(L1→R5)로 정렬해 매번 같은 결과가 나옵니다.
function analyzeScores(numbers) {
  const entries = ABILITIES.map((a, order) => {
    const percentage = numbers[a.id];
    return { ...a, order, percentage, level: diagnosticLevel(percentage) };
  });
  const byStableScore = (a, b) => a.percentage - b.percentage || a.order - b.order;

  const summarize = (list) => {
    const values = list.map((e) => e.percentage);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = average(values);
    return {
      entries: list,
      min, max, mean,
      index: mean,                                           // 진단 지수: 5개(또는 10개) 백분율의 단순 평균 (공식 점수 아님)
      lowest: list.filter((e) => e.percentage === min),      // 동점이면 모두 포함
      highest: list.filter((e) => e.percentage === max),
      wrong: list.length === 5 ? estimateWrongRange(values) : null,
    };
  };

  const ranked = [...entries].sort(byStableScore);           // 약한 순 → 강한 순
  const overall = summarize(entries);
  const result = {
    entries,
    ranked,
    overall,
    listening: summarize(entries.filter((e) => e.section === "listening")),
    reading: summarize(entries.filter((e) => e.section === "reading")),
    allEqual: overall.min === overall.max,
  };
  result.priorities = result.allEqual ? [] : ranked.slice(0, 3);   // 가장 낮은 3개
  return result;
}

/* --- 규칙 기반 해설 (AI 아님) --- */

const COMMENT_STEADY_LEAD = "이미 안정적이지만 다른 영역과 비교하면 상대적으로 낮은 편이에요. ";
const COMMENT_TOP = "이미 매우 강한 영역이에요. 지금 수준을 유지하도록 실전 문제로 감각만 이어가 보세요.";

function joinLabels(list, max) {
  const shown = list.slice(0, max).map((e) => e.fullLabel);
  return shown.join(", ") + (list.length > max ? ` 외 ${list.length - max}개` : "");
}

function generateRuleBasedCommentary(result) {
  let headline;
  if (result.allEqual) {
    headline = `10개 영역이 모두 ${fmtPct(result.overall.min)}%로 같아서 강점과 약점을 따로 나누지 않았어요.`;
  } else if (result.overall.min >= DIAGNOSTIC_LEVELS[0].min) {
    headline = "모든 영역이 95% 이상으로 매우 안정적이에요. 아래 영역을 마지막으로 다듬어 보세요.";
  } else {
    headline = `${joinLabels(result.overall.lowest, 3)} 영역을 가장 먼저 보완해 보세요.`;
  }

  // Listening 과 Reading 의 진단 지수를 비교해 균형을 한 줄로 설명
  const L = result.listening;
  const R = result.reading;
  const diff = Math.abs(L.index - R.index);
  let summary;
  if (diff < 3) {
    summary = `Listening 진단 지수(${fmtIndex(L.index)})와 Reading 진단 지수(${fmtIndex(R.index)})가 비슷해서 한쪽에 크게 치우치지 않았어요.`;
  } else {
    const [lowName, lowIdx, highName, highIdx] = L.index < R.index
      ? ["Listening", L.index, "Reading", R.index]
      : ["Reading", R.index, "Listening", L.index];
    summary = `${lowName} 진단 지수(${fmtIndex(lowIdx)})가 ${highName}(${fmtIndex(highIdx)})보다 ${fmtIndex(diff)} 낮아요. ${lowName} 쪽을 보완하면 전체 균형을 맞추는 데 도움이 돼요.`;
  }

  const priorities = result.priorities.map((a) => {
    let text;
    if (a.level.key === "top") text = COMMENT_TOP;
    else if (a.level.key === "steady") text = COMMENT_STEADY_LEAD + a.weakComment;
    else text = a.weakComment;
    return {
      id: a.id,
      text,
      tip: a.studyAdvice,
      appHint: a.appHint && a.level.key !== "top" ? a.appHint : "",
    };
  });

  return { engine: "rule-based", headline, summary, priorities };
}

// 해설 엔진: 같은 입력/출력 형태를 지키면 AI 해설로 바꿔 끼울 수 있음
const commentaryEngine = generateRuleBasedCommentary;

/* --- 상태 --- */

function submitAnalysis() {
  const { errors, numbers, valid } = validateAllScores(state.analysis.values);
  state.analysis.errors = errors;
  if (!valid) {
    render(false);
    const first = ABILITIES.find((a) => errors[a.id]);
    const input = first && mainEl.querySelector(`#score-${first.id}`);
    if (input) input.focus();
    return;
  }
  const result = analyzeScores(numbers);
  result.commentary = commentaryEngine(result);
  state.analysis.result = result;
  render(true);
  focusAnalysisTitle();
}

function resetAnalysisForm() {
  state.analysis.result = null;   // 입력값은 남겨 두어 일부만 고쳐 다시 분석할 수 있음
  state.analysis.errors = {};
  render(true);
  focusAnalysisTitle();
}

// 화면이 바뀌면 제목으로 포커스를 옮겨, 키보드/스크린리더 사용자가 새 내용을 바로 찾을 수 있게 함
function focusAnalysisTitle() {
  const title = mainEl.querySelector(".analysis-title");
  if (title) title.focus({ preventScroll: true });
}

/* --- 화면: 공통 조각 --- */

function levelBadge(level) {
  return el("span", { class: `level-badge lv-${level.key}`, text: level.label });
}

function analysisBack() {
  return el("button", { type: "button", class: "back-btn", text: "← 홈으로", onClick: () => go("home") });
}

function betaTag() {
  return el("span", { class: "beta-tag", text: "Beta" });
}

/* --- 화면: 입력 --- */

function scoreRow(a, index, form) {
  const inputId = `score-${a.id}`;
  const errorId = `score-error-${a.id}`;
  const isLast = index === ABILITIES.length - 1;
  const input = el("input", {
    class: "score-input", id: inputId, name: a.id,
    type: "text", inputmode: "decimal", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    enterkeyhint: isLast ? "done" : "next", maxlength: "6",
    value: state.analysis.values[a.id] || "",
    "aria-describedby": errorId,
    onFocus: (e) => e.target.select(),
    onInput: (e) => {
      state.analysis.values[a.id] = e.target.value;
      // 오류가 떠 있는 칸은 고치는 즉시 다시 검사해서 안내를 지움
      if (state.analysis.errors[a.id]) {
        const r = parseScore(e.target.value);
        if (r.ok) delete state.analysis.errors[a.id];
        else state.analysis.errors[a.id] = r.message;
        paintScoreErrors(form);
      }
    },
    // Enter 는 다음 칸으로 (제출은 마지막 칸 또는 버튼에서만)
    onKeydown: (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      const next = form.querySelectorAll(".score-input")[index + 1];
      if (next) next.focus();
      else submitAnalysis();
    },
  });
  return el("li", { class: "score-row" },
    el("label", { class: "score-label", for: inputId },
      el("span", { class: "score-code", text: a.id }), " ",   // 공백: 스크린리더가 "R3 추론"으로 읽도록 (flex 라 화면에는 영향 없음)
      el("span", { class: "score-label-text", text: a.shortLabel })),
    el("div", { class: "score-field" }, input, el("span", { class: "score-suffix", "aria-hidden": "true", text: "%" })),
    el("p", { class: "score-error", id: errorId, hidden: true })
  );
}

// state.analysis.errors 를 화면에 반영 (칸별 안내 + 아래쪽 요약)
function paintScoreErrors(root) {
  const errors = state.analysis.errors;
  let count = 0;
  for (const a of ABILITIES) {
    const input = root.querySelector(`#score-${a.id}`);
    const message = root.querySelector(`#score-error-${a.id}`);
    const text = errors[a.id] || "";
    if (text) count++;
    if (text) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    message.textContent = text;
    message.hidden = !text;
  }
  const summary = root.querySelector(".score-summary");
  summary.textContent = count ? `확인이 필요한 항목이 ${count}개 있어요. 표시된 칸을 고쳐 주세요.` : "";
  summary.hidden = count === 0;
}

function renderAnalysisForm() {
  const form = el("form", {
    class: "analysis-form", novalidate: true, "aria-label": "성적표 백분율 입력",
    onSubmit: (e) => { e.preventDefault(); submitAnalysis(); },
  });

  let index = 0;
  for (const section of ABILITY_SECTIONS) {
    form.append(
      el("section", { class: `card score-card is-${section.key}`, "aria-labelledby": `score-head-${section.key}` },
        el("h2", { class: "score-card-title", id: `score-head-${section.key}` },
          el("span", { class: "score-card-dot", "aria-hidden": "true" }),
          `${section.title} (${section.code})`),
        el("ul", { class: "score-list" },
          ABILITIES.filter((a) => a.section === section.key).map((a) => scoreRow(a, index++, form))))
    );
  }
  form.append(
    el("p", { class: "score-summary", role: "alert", hidden: true }),
    el("button", { type: "submit", class: "btn btn-primary btn-block analysis-submit", text: "분석하기" })
  );
  paintScoreErrors(form);

  return el("section", { class: "view analysis-view" },
    analysisBack(),
    el("div", { class: "analysis-head" },
      mascot("think", "mascot-analysis"),
      el("div", { class: "analysis-head-text" },
        el("h1", { class: "analysis-title", tabindex: "-1" }, "성적표 분석기", betaTag()),
        el("p", { class: "analysis-desc", text: "TOEIC 성적표의 Abilities Measured 백분율 10개를 그대로 입력해 주세요." }),
        el("p", { class: "analysis-note", text: "성적표 사진은 필요하지 않아요." }))
    ),
    form
  );
}

/* --- 화면: 결과 --- */

function highlightCard(kind, eyebrow, entries, note) {
  return el("article", { class: `card highlight-card is-${kind}` },
    el("p", { class: "highlight-eyebrow", text: eyebrow }),
    el("div", { class: "highlight-main" },
      el("strong", { class: "highlight-pct", text: `${fmtPct(entries[0].percentage)}%` }),
      levelBadge(entries[0].level)),
    el("ul", { class: "highlight-list" },
      entries.map((a) => el("li", null, el("span", { class: "score-code", text: a.id }), a.fullLabel))),
    hasText(note) && el("p", { class: "highlight-note", text: note })
  );
}

function wrongEstimateCard(result) {
  const tile = (code, w) => el("div", { class: "wrong-tile" },
    el("p", { class: "wrong-tile-label", text: `${code} 예상 오답` }),
    el("p", { class: "wrong-tile-value", text: `약 ${w.low}~${w.high}개` }));
  return el("article", { class: "card wrong-card" },
    el("div", { class: "wrong-card-head" },
      el("h2", { class: "block-title", text: "예상 오답 수" }),
      el("span", { class: "chip is-soft", text: "참고용 추정치" })),
    el("div", { class: "wrong-tiles" }, tile("LC", result.listening.wrong), tile("RC", result.reading.wrong)),
    el("p", { class: "wrong-disclaimer",
      text: "예상 오답 수는 세부 성취도 백분율을 이용한 참고용 추정치예요. 실제 문항별 능력 분류와 시험별 환산 방식에 따라 차이가 있을 수 있어요." }),
    el("details", { class: "more-info" },
      el("summary", { text: "왜 정확한 오답 수를 알 수 없나요?" }),
      el("p", { text: "TOEIC의 세부 성취도는 능력별 정답률이며, 능력마다 포함되는 문항 수가 같지 않고 일부 문항은 여러 능력을 함께 측정할 수 있어 정확한 오답 개수를 역산할 수 없습니다." }),
      el("p", { text: `이 추정은 구간별 5개 백분율의 평균으로 중심값을 구하고 앞뒤로 ${WRONG_ESTIMATE.baseMargin}문항 정도의 여유를 둔 토익한알 자체 계산이에요. 능력별 점수 차이가 크면 여유를 조금 더 넓혀요.` }))
  );
}

function abilityBarRow(a) {
  return el("li", { class: "ability-row" },
    el("div", { class: "ability-row-head" },
      el("span", { class: "ability-name" },
        el("span", { class: "score-code", text: a.id }),
        el("span", { class: "ability-label", text: a.shortLabel }),
        levelBadge(a.level)),
      el("span", { class: "ability-pct", text: `${fmtPct(a.percentage)}%` })),
    el("div", { class: `ability-track lv-${a.level.key}`, "aria-hidden": "true" },
      el("div", { class: "ability-fill", style: `width:${Math.max(0, Math.min(100, a.percentage))}%` }))
  );
}

function abilitySectionCard(section, summary) {
  return el("article", { class: `card ability-card is-${section.key}` },
    el("div", { class: "ability-card-head" },
      el("h3", { class: "ability-card-title" },
        el("span", { class: "score-card-dot", "aria-hidden": "true" }),
        `${section.title} (${section.code})`),
      el("span", { class: "index-chip", text: `진단 지수 ${fmtIndex(summary.index)}` })),
    el("ul", { class: "ability-list" }, summary.entries.map(abilityBarRow))
  );
}

function priorityItem(entry, rank, comment) {
  return el("li", { class: "priority-item" },
    el("span", { class: "priority-rank", "aria-hidden": "true", text: String(rank) }),
    el("div", { class: "priority-body" },
      el("div", { class: "priority-head" },
        el("strong", { class: "priority-name", text: entry.fullLabel }),
        el("span", { class: "priority-pct", text: `${fmtPct(entry.percentage)}%` }),
        levelBadge(entry.level)),
      el("p", { class: "priority-text", text: comment.text }),
      el("p", { class: "priority-tip" }, el("strong", { text: "학습 팁 " }), comment.tip),
      hasText(comment.appHint) && el("p", { class: "priority-app", text: comment.appHint }))
  );
}

function renderAnalysisResult() {
  const r = state.analysis.result;
  const c = r.commentary;
  const nodes = [];

  // A. 한알이의 성적 분석
  nodes.push(
    analysisBack(),
    el("div", { class: "analysis-head" },
      mascot("study", "mascot-analysis"),
      el("div", { class: "analysis-head-text" },
        el("h1", { class: "analysis-title", tabindex: "-1" }, "한알이의 성적 분석", betaTag()),
        el("p", { class: "analysis-desc", text: "입력한 백분율을 토익한알 분석 기준으로 정리했어요." }))
    ),
    el("div", { class: "hanali-says" },
      el("p", { class: "hanali-says-headline", text: c.headline }),
      el("p", { class: "hanali-says-summary", text: c.summary }))
  );

  // B / C. 보완할 영역, 가장 강한 영역 (동점이면 모두 표시)
  if (r.allEqual) {
    nodes.push(
      el("article", { class: "card highlight-card is-even" },
        el("p", { class: "highlight-eyebrow", text: "모든 영역이 같은 점수예요" }),
        el("div", { class: "highlight-main" },
          el("strong", { class: "highlight-pct", text: `${fmtPct(r.overall.min)}%` }),
          levelBadge(r.entries[0].level)),
        el("p", { class: "highlight-note", text: "10개 영역이 모두 같아서 강점과 약점을 따로 나누지 않았어요." }))
    );
  } else {
    const weak = r.overall.lowest;
    const strong = r.overall.highest;
    const weakIsStrongToo = weak[0].level.key === "top";
    nodes.push(
      highlightCard("weak", weakIsStrongToo ? "상대적으로 가장 낮은 영역" : "지금 가장 먼저 보완할 영역", weak,
        weak.length > 1 ? `같은 점수의 영역이 ${weak.length}개 있어요.` : ""),
      highlightCard("strong", "가장 강한 영역", strong,
        strong.length > 1 ? `같은 점수의 강점 영역이 ${strong.length}개 있어요.` : "")
    );
  }

  // D. 예상 오답 (추정)
  nodes.push(wrongEstimateCard(r));

  // E. 10개 능력 막대 그래프
  nodes.push(
    el("h2", { class: "block-title", text: "세부 능력 분석" }),
    abilitySectionCard(abilitySection("listening"), r.listening),
    abilitySectionCard(abilitySection("reading"), r.reading),
    el("p", { class: "index-note", text: "진단 지수는 토익한알이 5개 백분율을 단순 평균한 참고 수치로, 공식 정답률이나 점수가 아니에요." })
  );

  // F. 우선 학습 영역 (가장 낮은 3개, 동점이면 L1→R5 순서)
  if (r.priorities.length) {
    const commentById = new Map(c.priorities.map((p) => [p.id, p]));
    nodes.push(
      el("h2", { class: "block-title", text: "우선 학습 영역" }),
      el("p", { class: "block-sub", text: "점수가 낮은 순서대로 3개예요. 점수가 같으면 L1→R5 순서로 보여 드려요." }),
      el("ol", { class: "priority-list" },
        r.priorities.map((a, i) => priorityItem(a, i + 1, commentById.get(a.id)))),
      el("details", { class: "more-info is-standalone" },
        el("summary", { text: "10개 영역 전체 순위 보기 (낮은 순)" }),
        el("ol", { class: "rank-list" },
          r.ranked.map((a, i) => el("li", null,
            el("span", { class: "rank-no", text: `${i + 1}` }),
            el("span", { class: "rank-name", text: a.fullLabel }),
            el("span", { class: "rank-pct", text: `${fmtPct(a.percentage)}%` })))))
    );
  }

  // G. 안내
  nodes.push(
    el("p", { class: "analysis-disclaimer",
      text: "매우 강함·안정적·보완 권장·우선 보완은 입력한 백분율만으로 나눈 토익한알 분석 기준이에요. ETS가 정한 공식 등급이나 점수가 아니며, 해설은 정해진 규칙으로 만든 참고용이에요." })
  );

  // H. 다시 분석하기
  nodes.push(
    el("div", { class: "analysis-actions" },
      el("button", { type: "button", class: "btn btn-primary btn-block", text: "다시 분석하기", onClick: resetAnalysisForm }),
      el("button", { type: "button", class: "btn btn-secondary btn-block", text: "홈으로", onClick: () => go("home") }))
  );

  return el("section", { class: "view analysis-view analysis-result" }, nodes);
}

function renderAnalysis() {
  return state.analysis.result ? renderAnalysisResult() : renderAnalysisForm();
}

/* ---------- 4-f. 한알이에게 물어보기 (AI 도우미, 텍스트 전용) ----------
   - 모든 화면에서 쓸 수 있는 떠 있는 버튼 + 대화 패널. #main 바깥에 한 번만 만들어 두므로 화면을 옮겨도 그대로 유지
   - 브라우저는 /api/hanali-assistant 만 호출. OpenAI 키/클라이언트는 server.js 에만 있음
   - 대화 기록: localStorage "toeicHanalAiChatHistory" = [{ role: "user"|"assistant", content, at }] (다른 키와 별개)
     API 로는 최근 AI_CHAT.contextItems 개만 보냄 */

const AI_CHAT = {
  storageKey: "toeicHanalAiChatHistory",
  endpoint: "/api/hanali-assistant",
  greeting: "안녕하세요! 모르는 단어, 문장, 문법이나 TOEIC 문제를 물어보세요.",
  error: "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  contextItems: 12,
  storedItems: 60,
  maxInput: 4000,
};

const aiChat = { open: false, messages: [], loading: false, error: null, confirmClear: false, els: null };

function loadAiChat() {
  aiChat.messages = readStored(AI_CHAT.storageKey,
    (m) => m && (m.role === "user" || m.role === "assistant") && hasText(m.content));
}

function persistAiChat() {
  aiChat.messages = aiChat.messages.slice(-AI_CHAT.storedItems);
  writeStored(AI_CHAT.storageKey, aiChat.messages);
}

// 답변 표시용: 문단, "-"/"1." 목록, **굵게**, *기울임*, `코드` 만 지원. 항상 textContent 로 넣어 HTML 은 해석하지 않음
function aiInline(text) {
  const out = [];
  // *기울임* 안에 **굵게** 가 들어가는 경우(예문 속 핵심 표현)도 처리
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*(?![\s*])((?:\*\*.+?\*\*|[^*])+?)\*(?!\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(el("strong", { text: m[1] }));
    else if (m[2] != null) out.push(el("code", { text: m[2] }));
    else out.push(el("em", null, aiInline(m[3])));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// 빈 줄로 문단을 나누고, 이어진 줄(예문 + "→ 번역")은 한 문단 안에서 줄바꿈으로 붙여 보여줌
function aiRichText(text) {
  const root = el("div", { class: "chat-rich" });
  let list = null;
  let para = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const item = line.match(/^(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (item) {
      para = null;
      const tag = item[2] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(tag, item[2] ? { start: item[2] } : null);
        root.append(list);
      }
      list.append(el("li", null, aiInline(item[3])));
      continue;
    }
    list = null;
    if (!line || /^(-{3,}|\*{3,})$/.test(line)) { para = null; continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      para = null;
      root.append(el("p", { class: "chat-rich-head" }, aiInline(heading[1])));
      continue;
    }
    if (para) para.append(el("br"), ...aiInline(line));
    else {
      para = el("p", null, aiInline(line));
      root.append(para);
    }
  }
  return root;
}

function aiMessageNode(msg) {
  if (msg.role === "user") {
    return el("div", { class: "chat-msg is-user" }, el("div", { class: "chat-bubble", text: msg.content }));
  }
  return el("div", { class: "chat-msg is-hanali" },
    mascot("think", "chat-avatar"),
    el("div", { class: "chat-bubble" }, aiRichText(msg.content)));
}

function renderAiLog(scrollTo) {
  const { log, clearBtn, confirmRow, input, send } = aiChat.els;
  const nodes = [aiMessageNode({ role: "assistant", content: AI_CHAT.greeting })];
  aiChat.messages.forEach((m) => nodes.push(aiMessageNode(m)));
  if (aiChat.loading) {
    nodes.push(el("div", { class: "chat-msg is-hanali is-loading" },
      mascot("think", "chat-avatar mascot-idle"),
      el("div", { class: "chat-bubble" },
        el("span", { text: "한알이가 생각 중이에요" }),
        el("span", { class: "chat-dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")))));
  }
  if (aiChat.error) {
    nodes.push(el("div", { class: "chat-msg is-hanali is-error", role: "alert" },
      mascot("wrong", "chat-avatar"),
      el("div", { class: "chat-bubble", text: aiChat.error })));
  }
  log.replaceChildren(...nodes);

  clearBtn.hidden = aiChat.messages.length === 0 || aiChat.confirmClear;
  confirmRow.hidden = !aiChat.confirmClear;
  send.disabled = aiChat.loading || !input.value.trim();
  input.setAttribute("aria-busy", String(aiChat.loading));
  aiChat.els.fab.classList.toggle("is-thinking", aiChat.loading);

  if (scrollTo === "bottom") log.scrollTop = log.scrollHeight;
  // 새 답변은 끝이 아니라 시작 부분이 보이도록 (긴 해설도 위에서부터 읽기)
  if (scrollTo === "lastReply") {
    const last = log.lastElementChild;
    if (last) log.scrollTop += last.getBoundingClientRect().top - log.getBoundingClientRect().top - 8;
  }
}

function autosizeAiInput() {
  const input = aiChat.els.input;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 168) + "px";
  aiChat.els.send.disabled = aiChat.loading || !input.value.trim();
}

async function sendAiMessage() {
  const input = aiChat.els.input;
  const text = input.value.trim();
  if (!text || aiChat.loading) return;

  const history = aiChat.messages.slice(-AI_CHAT.contextItems).map(({ role, content }) => ({ role, content }));
  aiChat.messages.push({ role: "user", content: text, at: Date.now() });
  persistAiChat();
  input.value = "";
  autosizeAiInput();
  aiChat.loading = true;
  aiChat.error = null;
  aiChat.confirmClear = false;
  renderAiLog("bottom");

  try {
    const res = await fetch(AI_CHAT.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || !data.ok || !hasText(data.reply)) {
      aiChat.error = data && hasText(data.error) ? data.error : AI_CHAT.error;
    } else {
      aiChat.messages.push({ role: "assistant", content: data.reply.trim(), at: Date.now() });
      persistAiChat();
    }
  } catch {
    aiChat.error = AI_CHAT.error; // 네트워크 오류 / 서버 꺼짐 (정적 서버로 연 경우 포함)
  } finally {
    aiChat.loading = false;
    renderAiLog(aiChat.error ? "bottom" : "lastReply");
    if (!aiChat.error) popHanaliFab();
    if (aiChat.open) input.focus({ preventScroll: true });
  }
}

// 모바일 키보드가 올라오면 보이는 영역(visualViewport)만큼만 덮어서 입력창이 키보드에 가려지지 않게 함
function fitAiChatToViewport() {
  const vv = window.visualViewport;
  const overlay = aiChat.els.overlay;
  if (!aiChat.open || !vv) {
    overlay.style.top = overlay.style.height = overlay.style.bottom = "";
    return;
  }
  overlay.style.top = `${Math.round(vv.offsetTop)}px`;
  overlay.style.height = `${Math.round(vv.height)}px`;
  overlay.style.bottom = "auto";
}

function openAiChat() {
  if (aiChat.open) return;
  aiChat.open = true;
  markAiOnboardingSeen();
  fitAiChatToViewport();
  aiChat.els.overlay.hidden = false;
  aiChat.els.fab.setAttribute("aria-expanded", "true");
  aiChat.els.fab.classList.add("is-hidden");
  renderAiLog("bottom");
  autosizeAiInput();
  aiChat.els.input.focus({ preventScroll: true });
}

function closeAiChat() {
  if (!aiChat.open) return;
  aiChat.open = false;
  aiChat.confirmClear = false;
  aiChat.els.overlay.hidden = true;
  fitAiChatToViewport();
  aiChat.els.fab.setAttribute("aria-expanded", "false");
  aiChat.els.fab.classList.remove("is-hidden");
  scheduleHanaliFab();
  aiChat.els.fab.focus({ preventScroll: true });
}

function setupHanaliAssistant() {
  loadAiChat();

  loadAiFabPosition();
  const fab = el("button", {
    type: "button", class: "hanali-fab", title: "한알 AI",
    "aria-label": "한알 AI · 한알이에게 물어보기", "aria-haspopup": "dialog", "aria-expanded": "false",
    onClick: (e) => {
      // 드래그를 놓을 때 따라오는 click 은 무시 (패널이 열리지 않게)
      if (performance.now() < aiFab.suppressClickUntil) { e.preventDefault(); return; }
      openAiChat();
    },
    onPointerdown: onAiFabPointerDown,
    onPointermove: onAiFabPointerMove,
    onPointerup: onAiFabPointerUp,
    onPointercancel: onAiFabPointerUp,
  },
    el("span", { class: "hanali-fab-orb", "aria-hidden": "true" }, mascot("ai", "hanali-fab-img")),
    el("span", { class: "hanali-fab-badge", "aria-hidden": "true", text: "AI" }),
    el("span", { class: "hanali-fab-dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")));

  const tip = el("div", { class: "hanali-ai-tip", "aria-hidden": "true", hidden: true, onClick: openAiChat },
    "모르는 문제?", el("br"), el("strong", { text: "한알 AI" }), "한테 물어봐!");

  const input = el("textarea", {
    class: "chat-input", rows: "1", maxlength: String(AI_CHAT.maxInput),
    placeholder: "모르는 단어, 문장, 문제를 물어보세요", "aria-label": "한알이에게 질문 입력",
    onInput: autosizeAiInput,
    onKeydown: (e) => {
      // 한글 입력 조합 중의 Enter 는 글자 확정이므로 보내지 않음
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        sendAiMessage();
      }
    },
  });
  const send = el("button", { type: "submit", class: "chat-send", "aria-label": "보내기", disabled: true },
    svgIcon(["M5 12h13", "m12 6 6 6-6 6"]));
  const log = el("div", { class: "chat-log", role: "log", "aria-live": "polite", "aria-label": "한알이와의 대화" });

  const clearBtn = el("button", {
    type: "button", class: "chat-clear", text: "대화 지우기",
    onClick: () => { aiChat.confirmClear = true; renderAiLog(); aiChat.els.confirmRow.querySelector("button").focus(); },
  });
  const confirmRow = el("div", { class: "chat-confirm", role: "group", "aria-label": "대화 지우기 확인", hidden: true },
    el("span", { text: "대화를 모두 지울까요?" }),
    el("button", { type: "button", class: "chat-confirm-btn", text: "취소",
      onClick: () => { aiChat.confirmClear = false; renderAiLog(); clearBtn.focus(); } }),
    el("button", { type: "button", class: "chat-confirm-btn is-danger", text: "지우기",
      onClick: () => {
        aiChat.messages = [];
        aiChat.error = null;
        aiChat.confirmClear = false;
        persistAiChat();
        renderAiLog("bottom");
        input.focus();
      } }));

  const panel = el("section", {
    class: "chat-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "chat-title",
  },
    el("header", { class: "chat-head" },
      mascot("think", "chat-head-img"),
      el("h2", { class: "chat-title", id: "chat-title", text: "한알이에게 물어보기" }),
      clearBtn,
      el("button", { type: "button", class: "chat-close", "aria-label": "닫기", onClick: closeAiChat },
        svgIcon(["M6 6l12 12", "M18 6 6 18"]))),
    confirmRow,
    log,
    el("form", { class: "chat-form", onSubmit: (e) => { e.preventDefault(); sendAiMessage(); } }, input, send));

  const overlay = el("div", {
    class: "chat-overlay", hidden: true,
    onKeydown: (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeAiChat(); return; }
      if (e.key !== "Tab") return;
      // 패널 안에서만 포커스가 돌도록
      const items = [...panel.querySelectorAll("button, textarea")].filter((n) => !n.disabled && !n.closest("[hidden]"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },
  },
    el("div", { class: "chat-backdrop", onClick: closeAiChat }),
    el("div", { class: "chat-frame" }, panel));

  aiChat.els = { fab, tip, overlay, panel, log, input, send, clearBtn, confirmRow };
  document.body.append(fab, tip, overlay);
  if (!aiOnboardingSeen()) aiFab.tipTimer = setTimeout(showAiTip, AI_FAB.tipDelay);

  mainEl.addEventListener("scroll", scheduleHanaliFab, { passive: true });
  window.addEventListener("resize", scheduleHanaliFab);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitAiChatToViewport);
    window.visualViewport.addEventListener("scroll", fitAiChatToViewport);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleHanaliFab);
}

/* ---------- 한알 AI 떠 있는 버튼: 위치 / 드래그 / 가장자리 붙이기 / 첫 안내 말풍선 ----------
   위치는 { side: "left"|"right", y: 0~1 } 로 저장 (y = 화면 위쪽 ~ 하단 메뉴 바로 위 사이의 비율 → 화면 크기가 바뀌어도 비슷한 높이)
   학습 버튼(.study-actions 의 버튼: 단어 이전/다음, Part 5 정답 확인/다음 문제 등)과 겹치면 그 위로 잠시 올려서 가리지 않게 함.
   저장 위치는 그대로 두고, 표시 위치만 화면마다 다시 계산 */
const AI_FAB = {
  positionKey: "toeicHanalAiFloatingPosition",
  onboardingKey: "toeicHanalAiOnboardingSeen",
  edge: 10,          // 앱 좌우 가장자리와의 간격
  gap: 12,           // 하단 메뉴/학습 버튼과의 최소 간격
  dragThreshold: 6,  // 이보다 적게 움직이면 탭(열기), 넘으면 드래그
  snapMs: 360,
  tipDelay: 900,
  tipDuration: 9000,
};

const aiFab = {
  side: "right", ratio: 1, x: 0, y: 0, drag: null, suppressClickUntil: 0,
  frame: 0, snapTimer: 0, tipTimer: 0, popTimer: 0,
};

function clampNum(v, min, max) { return Math.min(max, Math.max(min, v)); }

function loadAiFabPosition() {
  try {
    const raw = localStorage.getItem(AI_FAB.positionKey);
    const p = raw == null ? null : JSON.parse(raw);
    if (p && (p.side === "left" || p.side === "right") && Number.isFinite(p.y)) {
      aiFab.side = p.side;
      aiFab.ratio = clampNum(p.y, 0, 1);
    }
  } catch (err) {
    console.warn(`[토익한알] localStorage "${AI_FAB.positionKey}" 를 읽지 못해 기본 위치를 사용합니다.`, err);
  }
}

function saveAiFabPosition() {
  writeStored(AI_FAB.positionKey, { side: aiFab.side, y: Math.round(aiFab.ratio * 1000) / 1000 });
}

function aiOnboardingSeen() {
  try { return localStorage.getItem(AI_FAB.onboardingKey) === "true"; } catch { return true; }
}

function markAiOnboardingSeen() {
  hideAiTip();
  if (!aiOnboardingSeen()) writeStored(AI_FAB.onboardingKey, true);
}

// 버튼이 움직일 수 있는 범위: 앱 좌우 안쪽, 본문 위쪽 ~ 하단 메뉴 바로 위
function aiFabBounds() {
  const fab = aiChat.els.fab;
  const w = fab.offsetWidth;
  const h = fab.offsetHeight;
  const app = document.querySelector(".app").getBoundingClientRect();
  const main = mainEl.getBoundingClientRect();
  const nav = document.querySelector(".bottom-nav");
  const navTop = nav ? nav.getBoundingClientRect().top : document.documentElement.clientHeight;
  const top = main.top + 8;
  return {
    w, h, app, main, top,
    left: app.left + AI_FAB.edge,
    right: app.right - AI_FAB.edge - w,
    bottom: Math.max(top, navTop - AI_FAB.gap - h),
  };
}

function aiControlRects(b) {
  return [...mainEl.querySelectorAll(".study-actions .btn")]
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.bottom > b.main.top && r.top < b.main.bottom);
}

// 같은 세로줄에 있는 학습 버튼과 겹치면 그 버튼 위로 올림
function aiFabAvoidControls(x, y, b) {
  const near = aiControlRects(b).filter((r) => r.right > x - AI_FAB.gap && r.left < x + b.w + AI_FAB.gap);
  for (let pass = 0; pass < 3; pass++) {
    const hit = near.find((r) => r.top < y + b.h + AI_FAB.gap && r.bottom > y - AI_FAB.gap);
    if (!hit) break;
    y = hit.top - AI_FAB.gap - b.h;
  }
  return Math.max(y, b.top);
}

function setAiFabXY(x, y) {
  aiFab.x = x;
  aiFab.y = y;
  aiChat.els.fab.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

// requestAnimationFrame 이 멈춰 있는 경우(백그라운드 탭 등)에도 버튼이 자리를 잡도록 짧은 타이머를 함께 둠
function scheduleHanaliFab() {
  if (aiFab.frame || !aiChat.els) return;
  const run = () => {
    if (!aiFab.frame) return;
    cancelAnimationFrame(aiFab.frame.raf);
    clearTimeout(aiFab.frame.timer);
    aiFab.frame = 0;
    updateHanaliFab();
  };
  aiFab.frame = { raf: requestAnimationFrame(run), timer: setTimeout(run, 120) };
}

function updateHanaliFab() {
  if (aiFab.drag && aiFab.drag.moved) return; // 드래그 중에는 손가락 위치를 그대로 따라감
  const b = aiFabBounds();
  const x = aiFab.side === "left" ? b.left : b.right;
  const y = aiFabAvoidControls(x, b.top + aiFab.ratio * (b.bottom - b.top), b);
  setAiFabXY(x, y);
  aiChat.els.fab.classList.add("is-ready");
  placeAiTip(b);
}

function onAiFabPointerDown(e) {
  if (!e.isPrimary || e.button !== 0) return;
  aiFab.drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: aiFab.x, y: aiFab.y, moved: false };
  try { aiChat.els.fab.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터: 캡처 없이 진행 */ }
}

function onAiFabPointerMove(e) {
  const d = aiFab.drag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  if (!d.moved) {
    if (Math.hypot(dx, dy) < AI_FAB.dragThreshold) return;
    d.moved = true;
    aiChat.els.fab.classList.remove("is-snapping");
    aiChat.els.fab.classList.add("is-dragging");
    hideAiTip();
  }
  const b = aiFabBounds();
  setAiFabXY(clampNum(d.x + dx, b.left, b.right), clampNum(d.y + dy, b.top, b.bottom));
}

// 놓으면 가까운 쪽 가장자리로 부드럽게 붙고, 높이는 놓은 자리 근처를 유지
function onAiFabPointerUp(e) {
  const d = aiFab.drag;
  if (!d || e.pointerId !== d.id) return;
  aiFab.drag = null;
  if (!d.moved) return; // 탭: 이어지는 click 에서 패널을 엶
  aiFab.suppressClickUntil = performance.now() + 400;

  const fab = aiChat.els.fab;
  const b = aiFabBounds();
  fab.classList.remove("is-dragging");
  aiFab.side = aiFab.x + b.w / 2 < (b.app.left + b.app.right) / 2 ? "left" : "right";
  aiFab.ratio = b.bottom > b.top ? clampNum((aiFab.y - b.top) / (b.bottom - b.top), 0, 1) : 1;
  saveAiFabPosition();

  fab.classList.add("is-snapping");
  updateHanaliFab();
  clearTimeout(aiFab.snapTimer);
  aiFab.snapTimer = setTimeout(() => fab.classList.remove("is-snapping"), AI_FAB.snapMs + 40);
}

// 답변이 도착하면 한 번 톡 튀어 오름 (시각 효과만)
function popHanaliFab() {
  const fab = aiChat.els.fab;
  fab.classList.remove("is-pop");
  void fab.offsetWidth;
  fab.classList.add("is-pop");
  clearTimeout(aiFab.popTimer);
  aiFab.popTimer = setTimeout(() => fab.classList.remove("is-pop"), 650);
}

/* 첫 안내 말풍선: 한알 AI 를 처음 열기 전까지만, 접속할 때 잠깐 보여주고 몇 초 뒤 사라짐.
   실제로 한알 AI 를 열어야 "봤음"(toeicHanalAiOnboardingSeen) 으로 저장 */
function showAiTip() {
  const tip = aiChat.els.tip;
  if (aiOnboardingSeen() || aiChat.open || (aiFab.drag && aiFab.drag.moved)) return;
  tip.hidden = false;
  placeAiTip(aiFabBounds());
  void tip.offsetWidth; // 보이기 전 상태를 한 번 그려야 투명도 전환이 적용됨
  tip.classList.add("is-visible");
  clearTimeout(aiFab.tipTimer);
  aiFab.tipTimer = setTimeout(hideAiTip, AI_FAB.tipDuration);
}

function hideAiTip() {
  const tip = aiChat.els && aiChat.els.tip;
  if (!tip) return;
  clearTimeout(aiFab.tipTimer);
  if (tip.hidden) return;
  tip.classList.remove("is-visible");
  aiFab.tipTimer = setTimeout(() => { tip.hidden = true; }, 260);
}

// 말풍선은 버튼 안쪽(화면 가운데 쪽)에 붙이고, 학습 버튼이나 하단 메뉴와 겹치면 잠깐 숨김
function placeAiTip(b) {
  const tip = aiChat.els.tip;
  if (tip.hidden) return;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const rawX = aiFab.side === "right" ? aiFab.x - tw - 12 : aiFab.x + b.w + 12;
  const x = clampNum(rawX, b.app.left + 8, b.app.right - 8 - tw);
  const y = clampNum(aiFab.y + b.h / 2 - th / 2, b.top, b.bottom + b.h - th);
  tip.dataset.side = aiFab.side;
  tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;

  const nav = document.querySelector(".bottom-nav");
  const blocks = [...aiControlRects(b), ...(nav ? [nav.getBoundingClientRect()] : [])];
  const blocked = blocks.some((r) => r.left < x + tw && r.right > x && r.top < y + th && r.bottom > y);
  tip.classList.toggle("is-blocked", blocked);
}

/* ---------- 5. 내비게이션 & 초기화 ---------- */

// analysis 는 하단 메뉴에 없는 홈의 하위 화면이라, 하단 메뉴에서는 "홈"이 선택된 것으로 표시
const RENDERERS = { home: renderHome, vocab: renderVocab, part5: renderPart5, analysis: renderAnalysis };

// resetScroll: 화면/문제가 바뀔 때만 맨 위로 이동 (선택지 탭 시에는 위치 유지)
function render(resetScroll) {
  const scrollTop = mainEl.scrollTop;
  mainEl.replaceChildren(RENDERERS[state.view]());
  mainEl.scrollTop = resetScroll ? 0 : scrollTop;

  const navView = state.view === "analysis" ? "home" : state.view;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    if (btn.dataset.view === navView) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  scheduleHanaliFab();
}

function go(view) {
  if (!RENDERERS[view]) return;
  // Part 5를 떠나면 유형 선택으로 되돌림. 일반 회차/오답노트/단어장은 그대로 둠
  if (state.view === "part5" && view !== "part5") resetPart5Browse();
  state.view = view;
  render(true);
  preloadMascots(view);
}

async function init() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.view));
  });

  loadSavedState();
  setupHanaliAssistant();
  go("home");

  const [vocab, part5] = await Promise.all([
    loadJson("vocab", DATA_FILES.vocab),
    loadJson("part5", DATA_FILES.part5),
  ]);
  state.data.vocab = vocab;
  state.data.part5 = part5;
  buildVocabIndex(vocab);
  buildPart5Index(part5);
  if (part5) restoreNormalSession(); // 저장된 세션 복원 + 완료한 문제 제외
  if (vocab) restoreVocabSession(); // 저장된 단어 학습 회차 복원 (보던 단어 유지, 새 단어는 뒤에 추가)

  // 로딩이 끝난 뒤 현재 화면을 다시 그림 (스크롤 유지)
  render(false);
}

init();
