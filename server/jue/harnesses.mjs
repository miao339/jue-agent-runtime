import fs from "node:fs/promises";
import path from "node:path";
import { compactText, ensureInitialized, normalizeTags, pathExists, readJson, utcNowIso, writeJson } from "./storage.mjs";

const RESERVED_HARNESS_IDS = new Set(["archive", ".", ".."]);
const ROOT_NOTICE = "注意：此片段只能收窄主ROOT_PARADIGM，不能更宽松。";
const EVOLUTION_NOTICE = "（上一个模型认为这个harness在上述情况下可能需要进化。是方向，不是规定。）";

export function isValidHarnessId(harnessId) {
  return Boolean(
    typeof harnessId === "string" &&
      harnessId.trim() === harnessId &&
      harnessId &&
      !RESERVED_HARNESS_IDS.has(harnessId) &&
      !/[\\/]/u.test(harnessId) &&
      !harnessId.includes("\0")
  );
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/\\,;:!?。，；：！？]+/gu, "-")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .slice(0, 60);
}

export function harnessIdFromName(name) {
  const match = String(name || "").trim().match(/[（(]([A-Za-z0-9][A-Za-z0-9 _-]{0,58})[）)]\s*$/u);
  if (match) {
    const candidate = slugify(match[1]);
    if (candidate) return candidate;
  }
  return slugify(name);
}

function humanTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace("T", " ");
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function buildHarnessMd(record) {
  const parts = [
    `# Harness: ${record.harness_id}\n`,
    `名称：${record.name}\n`,
    `分类：${record.category}\n`,
    `创建时间：${humanTime(record.created_at)}\n`,
    `版本：v${record.version}\n\n`
  ];
  if (record.tags?.length) parts.push(`**领域**: ${record.tags.join(", ")}\n`);
  parts.push("## 情境\n\n", `${record.situation}\n\n`);
  parts.push("## 判断过程\n\n", `${record.judgment}\n\n`);
  parts.push("## 可执行方向\n\n", `${record.structure}\n\n`);
  if (record.root_paradigm_fragment?.trim()) {
    parts.push("## ROOT_PARADIGM收窄\n\n", `${record.root_paradigm_fragment}\n\n`, `${ROOT_NOTICE}\n\n`);
  }
  if (record.soul?.trim()) parts.push("## 专属SOUL\n\n", `${record.soul}\n\n`);
  if (record.evolution_direction?.trim()) {
    parts.push("## 进化方向\n\n", `${record.evolution_direction}\n\n`, `${EVOLUTION_NOTICE}\n\n`);
  }
  parts.push("## 进化日志\n\n");
  if (record.version > 1 && record.evolution_reason) {
    parts.push(`### v${record.version}\n\n`, `**进化原因**: ${record.evolution_reason}\n\n`);
  } else {
    parts.push("（首次创建，暂无进化记录。）\n\n");
  }
  return parts.join("");
}

function buildMeta(record) {
  return {
    harness_id: record.harness_id,
    name: record.name,
    category: record.category,
    version: record.version,
    parent_version_id: record.parent_version_id || "",
    evolution_reason: record.evolution_reason || "",
    evolution_direction: record.evolution_direction || "",
    tags: record.tags || [],
    track: record.track || "harness",
    created_at: record.created_at,
    api_config_name: record.api_config_name || "",
    status: record.status || "active"
  };
}

function parseHarnessMd(mdText) {
  const known = new Set(["情境", "判断过程", "可执行方向", "ROOT_PARADIGM收窄", "专属SOUL", "进化方向", "进化日志"]);
  const sections = {};
  let current = "";
  let lines = [];
  for (const line of String(mdText || "").split("\n")) {
    const match = line.match(/^##\s+(.+?)\s*$/u);
    if (match && known.has(match[1])) {
      if (current) sections[current] = lines.join("\n").trim();
      current = match[1];
      lines = [];
    } else {
      lines.push(line);
    }
  }
  if (current) sections[current] = lines.join("\n").trim();
  return sections;
}

function stripNotice(value, notice) {
  return String(value || "")
    .split("\n")
    .filter((line) => line.trim() !== notice)
    .join("\n")
    .trim();
}

export class HarnessStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async init() {
    this.h3 = await ensureInitialized(this.rootDir);
    this.harnessesDir = path.join(this.h3, "harnesses");
    this.archiveDir = path.join(this.harnessesDir, "archive");
  }

  async write(input) {
    await this.init();
    const record = normalizeHarnessRecord(input);
    if (!isValidHarnessId(record.harness_id)) return "";
    if (!record.situation || !record.judgment || !record.structure) return "";
    const harnessDir = path.join(this.harnessesDir, record.harness_id);
    await fs.mkdir(harnessDir, { recursive: true });
    await fs.writeFile(path.join(harnessDir, "HARNESS.md"), buildHarnessMd(record), "utf8");
    await writeJson(path.join(harnessDir, "meta.json"), buildMeta(record));
    return record.harness_id;
  }

  async get(harnessId) {
    await this.init();
    if (!isValidHarnessId(harnessId)) return null;
    const harnessDir = path.join(this.harnessesDir, harnessId);
    const mdPath = path.join(harnessDir, "HARNESS.md");
    if (!pathExists(mdPath)) return null;
    const meta = await readJson(path.join(harnessDir, "meta.json"), {});
    const md = await fs.readFile(mdPath, "utf8");
    const sections = parseHarnessMd(md);
    return normalizeHarnessRecord({
      harness_id: meta.harness_id || harnessId,
      name: meta.name || harnessId,
      category: meta.category || "",
      situation: sections["情境"] || "",
      judgment: sections["判断过程"] || "",
      structure: sections["可执行方向"] || "",
      root_paradigm_fragment: stripNotice(sections["ROOT_PARADIGM收窄"], ROOT_NOTICE),
      soul: sections["专属SOUL"] || "",
      evolution_direction: meta.evolution_direction || stripNotice(sections["进化方向"], EVOLUTION_NOTICE),
      tags: meta.tags || [],
      track: meta.track || "harness",
      status: meta.status || "active",
      created_at: meta.created_at || utcNowIso(),
      version: meta.version || 1,
      parent_version_id: meta.parent_version_id || "",
      evolution_reason: meta.evolution_reason || ""
    });
  }

  async list({ status = "active", category = null, track = null, limit = 20 } = {}) {
    await this.init();
    const entries = await fs.readdir(this.harnessesDir, { withFileTypes: true }).catch(() => []);
    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "archive") continue;
      const meta = await readJson(path.join(this.harnessesDir, entry.name, "meta.json"), {});
      const record = {
        harness_id: meta.harness_id || entry.name,
        name: meta.name || entry.name,
        category: meta.category || "",
        version: meta.version || 1,
        status: meta.status || "active",
        tags: meta.tags || [],
        track: meta.track || "harness",
        created_at: meta.created_at || ""
      };
      if (status && record.status !== status) continue;
      if (category && record.category !== category) continue;
      if (track && record.track !== track) continue;
      results.push(record);
    }
    results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return results.slice(0, limit);
  }

  async evolve(harnessId, input, reason = "") {
    await this.init();
    const current = await this.get(harnessId);
    if (!current) return "";
    const archiveDir = path.join(this.archiveDir, `${harnessId}_v${current.version}`);
    await fs.rm(archiveDir, { recursive: true, force: true });
    await fs.mkdir(this.archiveDir, { recursive: true });
    await fs.cp(path.join(this.harnessesDir, harnessId), archiveDir, { recursive: true });
    const next = normalizeHarnessRecord({
      ...current,
      ...input,
      harness_id: current.harness_id,
      version: current.version + 1,
      parent_version_id: current.harness_id,
      evolution_reason: reason || input.evolution_reason || `v${current.version + 1}进化`
    });
    await this.write(next);
    return next.harness_id;
  }
}

export function normalizeHarnessRecord(input) {
  return {
    harness_id: String(input.harness_id || "").trim(),
    name: String(input.name || "").trim(),
    category: String(input.category || "general").trim(),
    situation: String(input.situation || "").trim(),
    judgment: String(input.judgment || "").trim(),
    structure: String(input.structure || "").trim(),
    root_paradigm_fragment: String(input.root_paradigm_fragment || "").trim(),
    soul: String(input.soul || "").trim(),
    api_config_name: String(input.api_config_name || "").trim(),
    tags: normalizeTags(input.tags),
    track: input.track || "harness",
    status: input.status || "active",
    created_at: input.created_at || utcNowIso(),
    version: Number(input.version || 1),
    parent_version_id: input.parent_version_id || "",
    evolution_reason: input.evolution_reason || "",
    evolution_direction: input.evolution_direction || ""
  };
}

export function harnessSummary(record) {
  return {
    harness_id: record.harness_id,
    name: record.name,
    category: record.category,
    version: record.version,
    status: record.status,
    tags: record.tags || [],
    created_at: record.created_at,
    situation: compactText(record.situation, 500),
    structure: compactText(record.structure, 500)
  };
}
