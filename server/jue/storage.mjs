import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = process.env.JUE_PLUGIN_ROOT || path.resolve(MODULE_DIR, "../..");
export const STATE_DIR = process.env.JUE_STATE_DIR || path.join(os.homedir(), ".jue-claude-code");

export function utcNowIso() {
  return new Date().toISOString();
}

export function makeTripletId() {
  return `h3-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function pathExists(filePath) {
  return existsSync(filePath);
}

export async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function atomicWriteFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export function harness3Dir(root = STATE_DIR) {
  return path.join(root, "harness3");
}

export function statePath(root = STATE_DIR) {
  return path.join(harness3Dir(root), "state.json");
}

export async function ensureInitialized(root = STATE_DIR) {
  const h3 = harness3Dir(root);
  await fs.mkdir(path.join(h3, "triplets"), { recursive: true });
  await fs.mkdir(path.join(h3, "harnesses", "archive"), { recursive: true });

  const indexPath = path.join(h3, "index.json");
  if (!pathExists(indexPath)) {
    await writeJson(indexPath, { triplets: [], updated_at: utcNowIso() });
  }

  const runtimeHarnesses = path.join(h3, "harnesses");
  const entries = await fs.readdir(runtimeHarnesses).catch(() => []);
  const hasHarness = entries.some((entry) => entry !== "archive");
  const seedHarnesses = path.join(PLUGIN_ROOT, "seed", "harness3", "harnesses");
  if (!hasHarness && pathExists(seedHarnesses)) {
    await fs.cp(seedHarnesses, runtimeHarnesses, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  }

  return h3;
}

export async function readState(root = STATE_DIR) {
  await ensureInitialized(root);
  return readJson(statePath(root), {});
}

export async function writeState(state, root = STATE_DIR) {
  await writeJson(statePath(root), state);
}

export function sessionKeyFromPayload(payload = {}) {
  return String(payload.session_id || payload.sessionId || payload.transcript_path || payload.transcriptPath || "").trim();
}

export function rememberSessionHarness(state, sessionKey = state.current_session_key || "") {
  const key = String(sessionKey || "").trim();
  if (!key) return state;
  state.current_session_key = key;
  const sessions = state._session_harnesses && typeof state._session_harnesses === "object" ? state._session_harnesses : {};
  sessions[key] = {
    harness_id: state.active_harness_id || null,
    active_set_by: state.active_set_by || null,
    active_set_at: state.active_set_at || null,
    updated_at: utcNowIso()
  };
  state._session_harnesses = Object.fromEntries(
    Object.entries(sessions)
      .sort((a, b) => String(a[1]?.updated_at || "").localeCompare(String(b[1]?.updated_at || "")))
      .slice(-80)
  );
  return state;
}

export function restoreSessionHarness(state, sessionKey) {
  const key = String(sessionKey || "").trim();
  if (!key) return false;
  state.current_session_key = key;
  const entry = state._session_harnesses?.[key];
  if (!entry) return false;
  if (entry.harness_id) state.active_harness_id = entry.harness_id;
  else delete state.active_harness_id;
  state.active_set_by = entry.active_set_by || null;
  if (entry.active_set_at) state.active_set_at = entry.active_set_at;
  else delete state.active_set_at;
  return true;
}

export function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    for (const part of String(item).split(/[,，;；\n]+/u)) {
      const tag = part.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function normalizeTripletIds(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const ids = [];
  for (const item of raw) {
    for (const part of String(item).split(/[\s,，;；\n]+/u)) {
      const id = part.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function normalizeTrack(value) {
  const track = String(value || "harness").trim();
  return track === "skill" ? "skill" : "harness";
}

export function safeInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function compactText(value, maxChars = 300) {
  const text = String(value || "");
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
