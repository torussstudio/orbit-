'use strict';

/*
 * Minimal Google Gemini client (REST, no SDK) for Orbit AI.
 *
 * .env
 *   GEMINI_API_KEY   required; Orbit AI is off without it
 *   AI_MODEL         main model      (default gemini-flash-latest)
 *   AI_MODEL_LITE    fallback model  (default gemini-flash-lite-latest)
 *   AI_THINKING      off (default) | low | model
 *                    Newer Gemini models "think" before answering, which
 *                    adds seconds before the first word. Orbit's questions
 *                    are simple lookups, so thinking is switched off (or set
 *                    to the lowest level the model allows). "model" leaves
 *                    the model's own default.
 *
 * Free tier: when the main model is rate limited (429), busy (500 / 503) or
 * too slow (504), the call is retried on the lite model, and the main model
 * is skipped for a while so later questions (and the next tool round) go
 * straight to the lite one instead of waiting on a busy model again.
 *
 * Slow answers: Google sometimes keeps a request hanging for a minute before
 * saying 503 / 504. A streamed answer that has not started within
 * AI_FIRST_BYTE_MS (default 12 s), or that stalls for 20 s, is given up and
 * retried on the lite model, so a busy model costs seconds, not a minute.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 25_000; // one-shot calls (briefing)
const STREAM_TOTAL_MS = 60_000; // a whole streamed answer
const STREAM_IDLE_MS = 20_000; // silence between two streamed pieces
const firstByteMs = () => Math.max(3000, Number.parseInt(process.env.AI_FIRST_BYTE_MS, 10) || 12_000);
const COOL_DOWN_MS = { 429: 60_000, 500: 120_000, 503: 120_000, 504: 120_000 };

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const retryable = (err) => [429, 500, 503, 504].includes(err?.status);

function settings() {
  return {
    key: process.env.GEMINI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-flash-latest',
    lite: process.env.AI_MODEL_LITE || 'gemini-flash-lite-latest',
    thinking: (process.env.AI_THINKING || 'off').toLowerCase(),
  };
}

const isEnabled = () => Boolean(settings().key);

/* ---------- Thinking control ---------- */

/*
 * Gemini 2.x takes thinkingConfig.thinkingBudget (0 = off); Gemini 3 takes
 * thinkingConfig.thinkingLevel ("minimal" / "low"). The "-latest" aliases can
 * point at either, so the options are tried in order and the first one the
 * model accepts is remembered per model. A model that rejects all of them
 * simply gets none.
 */
const THINKING_OPTIONS = {
  off: [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, { thinkingLevel: 'low' }, null],
  low: [{ thinkingLevel: 'low' }, { thinkingBudget: 512 }, null],
};
const thinkingChoice = new Map(); // model -> index into the options list

function thinkingOptions(model) {
  const mode = settings().thinking;
  if (!THINKING_OPTIONS[mode]) return [null];
  const list = THINKING_OPTIONS[mode];
  // Gemini 2.x never knows thinkingLevel: start with the budget.
  const ordered = /gemini-2/.test(model) ? [...list.filter((o) => o && 'thinkingBudget' in o), null] : list;
  const known = thinkingChoice.get(model);
  return known === undefined ? ordered : [ordered[known]];
}

// A 400 caused by the thinking settings (not by the request itself).
const thinkingRejected = (err) => err?.status === 400 && /think/i.test(err.message || '');

function bodyFor(base, thinking) {
  if (!thinking) return base;
  return { ...base, generationConfig: { ...base.generationConfig, thinkingConfig: thinking } };
}

// Runs send(body) with the first thinking setting this model accepts.
async function withThinking(model, base, send) {
  const options = thinkingOptions(model);
  let lastError;
  for (let i = 0; i < options.length; i += 1) {
    try {
      const result = await send(bodyFor(base, options[i]));
      if (!thinkingChoice.has(model) && options.length > 1) {
        const full = thinkingOptions(model);
        thinkingChoice.set(model, full.indexOf(options[i]));
      }
      return result;
    } catch (err) {
      lastError = err;
      if (!thinkingRejected(err) || i === options.length - 1) throw err;
    }
  }
  throw lastError;
}

/* ---------- Which models to try ---------- */

const coolingUntil = new Map(); // model -> ms

function modelOrder(lite) {
  const s = settings();
  if (lite) return [s.lite];
  const order = [s.model, s.lite];
  // Main model was rate limited a moment ago: go straight to the lite one.
  if ((coolingUntil.get(s.model) || 0) > Date.now()) return [...new Set([s.lite, s.model])];
  return [...new Set(order)];
}

function noteFailure(model, err) {
  const ms = COOL_DOWN_MS[err?.status];
  if (ms && !err?.stopped) coolingUntil.set(model, Date.now() + ms);
}

function finalError(lastError) {
  if (lastError?.stopped) return lastError;
  if (lastError?.status === 429) {
    return fail(429, 'Orbit AI has hit its free limit for now. Try again in a minute; the daily limit resets after midday.');
  }
  if (lastError?.upstream) {
    console.error('[ai] Gemini error:', lastError.status, lastError.message);
    return fail(502, 'Orbit AI (Google Gemini) is busy right now. Try again in a minute.');
  }
  return lastError;
}

function baseBody({ system, contents, tools, maxTokens, temperature }) {
  const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) body.tools = [{ functionDeclarations: tools }];
  return body;
}

/* ---------- One-shot ---------- */

async function callModel(model, body) {
  const { key } = settings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw fail(res.status, data?.error?.message || `Gemini answered ${res.status}`, { upstream: true });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw fail(504, 'Orbit AI took too long to answer.', { upstream: true });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/*
 * generate({ system, contents, tools, lite, maxTokens, temperature })
 * Returns { content, model } where content is the model's Content object
 * ({ role: 'model', parts: [...] }), passed back unchanged on the next turn.
 */
async function generate({ system, contents, tools, lite = false, maxTokens = 1024, temperature = 0.4 }) {
  if (!isEnabled()) throw fail(503, 'Orbit AI is not set up yet (no API key on the server).');
  const base = baseBody({ system, contents, tools, maxTokens, temperature });
  let lastError;
  for (const model of modelOrder(lite)) {
    try {
      const data = await withThinking(model, base, (body) => callModel(model, body));
      const content = data?.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
        throw fail(502, reason === 'SAFETY' ? 'Orbit AI could not answer that one.' : 'Orbit AI returned an empty answer. Try again.');
      }
      return { content: { role: 'model', parts: content.parts }, model };
    } catch (err) {
      lastError = err;
      noteFailure(model, err);
      if (!retryable(err)) break;
      console.warn(`[ai] ${model} failed (${err.status}), trying fallback`);
    }
  }
  throw finalError(lastError);
}

/* ---------- Streaming ---------- */

// Adds one streamed part to the assembled ones: text pieces are joined,
// anything else (function calls, signatures) is kept as is.
function mergePart(parts, part) {
  const last = parts[parts.length - 1];
  const plainText = (p) => p && typeof p.text === 'string' && !p.thought && !p.functionCall && !p.thoughtSignature;
  if (plainText(part) && plainText(last)) {
    last.text += part.text;
  } else {
    parts.push({ ...part });
  }
}

async function streamModel(model, body, onText, signal) {
  const { key } = settings();
  const controller = new AbortController();
  // Overall cap, plus a shorter one that is reset by every streamed piece:
  // first the wait for the answer to start, then the silence between pieces.
  const total = setTimeout(() => controller.abort(), STREAM_TOTAL_MS);
  let quiet = setTimeout(() => controller.abort(), firstByteMs());
  const heardFrom = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => controller.abort(), STREAM_IDLE_MS);
  };
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const res = await fetch(`${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw fail(res.status, data?.error?.message || `Gemini answered ${res.status}`, { upstream: true });
    }
    const parts = [];
    let finishReason = null;
    let buffer = '';
    const decoder = new TextDecoder();
    const handle = (line) => {
      if (!line.startsWith('data:')) return;
      let chunk;
      try { chunk = JSON.parse(line.slice(5).trim()); } catch { return; }
      const candidate = chunk?.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts || []) {
        mergePart(parts, part);
        if (typeof part.text === 'string' && part.text && !part.thought) onText?.(part.text);
      }
    };
    for await (const value of res.body) {
      heardFrom();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach(handle);
    }
    if (buffer) handle(buffer);
    if (!parts.length) {
      throw fail(502, finishReason === 'SAFETY' ? 'Orbit AI could not answer that one.' : 'Orbit AI returned an empty answer. Try again.');
    }
    return { role: 'model', parts };
  } catch (err) {
    if (err.name === 'AbortError') {
      if (signal?.aborted) throw fail(499, 'Stopped.', { stopped: true });
      throw fail(504, 'Orbit AI took too long to answer.', { upstream: true });
    }
    throw err;
  } finally {
    clearTimeout(total);
    clearTimeout(quiet);
    signal?.removeEventListener('abort', abort);
  }
}

/*
 * stream({ ...same as generate, onText, signal }) -> { content, model }
 * onText(piece) is called as the answer arrives. Falls back to the lite
 * model only if nothing has been streamed yet.
 */
async function stream({ system, contents, tools, lite = false, maxTokens = 1024, temperature = 0.4, onText, signal }) {
  if (!isEnabled()) throw fail(503, 'Orbit AI is not set up yet (no API key on the server).');
  const base = baseBody({ system, contents, tools, maxTokens, temperature });
  let streamed = false;
  const relay = (text) => { streamed = true; onText?.(text); };
  let lastError;
  for (const model of modelOrder(lite)) {
    try {
      const content = await withThinking(model, base, (body) => streamModel(model, body, relay, signal));
      return { content, model };
    } catch (err) {
      lastError = err;
      noteFailure(model, err);
      if (err.stopped || streamed || !retryable(err)) break;
      console.warn(`[ai] ${model} stream failed (${err.status}), trying fallback`);
    }
  }
  throw finalError(lastError);
}

module.exports = { generate, stream, isEnabled, settings };
