import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function defaultStateDir() {
  return process.env.JUE_STATE_DIR || path.join(os.homedir(), ".jue-claude-code");
}

function shortName(value, max = 28) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function modeLabel(value) {
  if (value === "user") return "固定";
  if (value === "model") return "模型";
  if (value === "auto") return "自动";
  return "默认";
}

const input = await readStdinJson();
const stateDir = defaultStateDir();
const state = await readJson(path.join(stateDir, "harness3", "state.json"), {});
const activeId = String(state.active_harness_id || "").trim();
const setBy = state.active_set_by || null;

let harnessLabel = "默认";
let harnessSegment = "⚖ 默认";
if (activeId) {
  const meta = await readJson(path.join(stateDir, "harness3", "harnesses", activeId, "meta.json"), {});
  harnessLabel = meta.name || activeId;
  harnessSegment = `⚖ ${shortName(harnessLabel)} · ${modeLabel(setBy)}`;
}

const model = input.model?.display_name || input.model?.id || "Claude";
const cwd = input.workspace?.current_dir || input.cwd || "";
const dir = cwd ? (cwd.includes("\\") ? path.win32.basename(cwd) : path.basename(cwd)) : "";
const pct = Math.round(Number(input.context_window?.used_percentage ?? 0));

const parts = [
  harnessSegment,
  shortName(model, 18),
  dir ? shortName(dir, 24) : "",
  Number.isFinite(pct) && pct > 0 ? `${pct}% ctx` : ""
].filter(Boolean);

process.stdout.write(`${parts.join(" | ")}\n`);
