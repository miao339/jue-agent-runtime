import fs from "node:fs/promises";
import path from "node:path";
import {
  compactText,
  ensureInitialized,
  harness3Dir,
  makeTripletId,
  normalizeTags,
  normalizeTrack,
  readJson,
  safeInt,
  utcNowIso,
  writeJson
} from "./storage.mjs";

export const TRIPLET_STATUSES = new Set(["active", "flagged", "revoked", "harnessed"]);

export class TripletStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async init() {
    this.h3 = await ensureInitialized(this.rootDir);
    this.tripletsDir = path.join(this.h3, "triplets");
    this.indexPath = path.join(this.h3, "index.json");
  }

  async write(input) {
    await this.init();
    const triplet = {
      triplet_id: input.triplet_id || makeTripletId(),
      situation: String(input.situation || "").trim(),
      judgment: String(input.judgment || "").trim(),
      structure: String(input.structure || "").trim(),
      tags: normalizeTags(input.tags),
      track: normalizeTrack(input.track),
      status: input.status || "active",
      created_at: input.created_at || utcNowIso(),
      task_id: input.task_id || "",
      session_id: input.session_id || "",
      merged_from: Array.isArray(input.merged_from) ? input.merged_from : [],
      merge_reason: input.merge_reason || ""
    };
    if (!triplet.situation || !triplet.judgment || !triplet.structure) return "";
    if (!TRIPLET_STATUSES.has(triplet.status)) triplet.status = "active";
    await writeJson(path.join(this.tripletsDir, `${triplet.triplet_id}.json`), triplet);
    await this.updateIndex(triplet);
    return triplet.triplet_id;
  }

  async get(tripletId) {
    await this.init();
    return readJson(path.join(this.tripletsDir, `${tripletId}.json`), null);
  }

  async list({ limit = 20, track = null, status = "active", tags = [] } = {}) {
    await this.init();
    const index = await readJson(this.indexPath, { triplets: [] });
    let entries = [...(index.triplets || [])];
    if (track) entries = entries.filter((entry) => entry.track === track);
    if (status && status !== "all") entries = entries.filter((entry) => (entry.status || "active") === status);
    if (tags.length) {
      const wanted = new Set(tags);
      entries = entries.filter((entry) => {
        const present = new Set(entry.tags || []);
        return [...wanted].every((tag) => present.has(tag));
      });
    }
    entries.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const results = [];
    for (const entry of entries.slice(0, safeInt(limit, 20))) {
      const triplet = await this.get(entry.triplet_id);
      if (triplet) results.push(triplet);
    }
    return results;
  }

  async search(query, { limit = 5, track = null } = {}) {
    await this.init();
    const q = String(query || "").toLowerCase();
    if (!q.trim()) return [];
    const queryChars = new Set([...q]);
    const queryWords = new Set(q.match(/[a-zA-Z0-9]+/g) || []);
    const index = await readJson(this.indexPath, { triplets: [] });
    const scored = [];
    for (const entry of index.triplets || []) {
      if (track && entry.track !== track) continue;
      const text = `${entry.situation || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
      const entryWords = new Set(text.match(/[a-zA-Z0-9]+/g) || []);
      const entryChars = new Set([...text]);
      const wordOverlap = [...queryWords].filter((word) => entryWords.has(word)).length;
      const charOverlap = [...queryChars].filter((char) => entryChars.has(char)).length;
      const score = wordOverlap * 3 + charOverlap * 0.2;
      if (score > 0.3) scored.push([score, entry]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const results = [];
    for (const [, entry] of scored.slice(0, safeInt(limit, 5))) {
      const triplet = await this.get(entry.triplet_id);
      if (triplet) results.push(triplet);
    }
    return results;
  }

  async updateStatus(tripletId, status) {
    await this.init();
    if (!TRIPLET_STATUSES.has(status)) return false;
    const triplet = await this.get(tripletId);
    if (!triplet) return false;
    triplet.status = status;
    await writeJson(path.join(this.tripletsDir, `${tripletId}.json`), triplet);
    await this.updateIndex(triplet);
    return true;
  }

  async delete(tripletId) {
    await this.init();
    const filePath = path.join(this.tripletsDir, `${tripletId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      return false;
    }
    const index = await readJson(this.indexPath, { triplets: [] });
    index.triplets = (index.triplets || []).filter((entry) => entry.triplet_id !== tripletId);
    index.updated_at = utcNowIso();
    await writeJson(this.indexPath, index);
    return true;
  }

  async updateIndex(triplet) {
    const index = await readJson(this.indexPath, { triplets: [], updated_at: utcNowIso() });
    const entry = {
      triplet_id: triplet.triplet_id,
      situation: compactText(triplet.situation, 200),
      tags: triplet.tags || [],
      track: triplet.track || "harness",
      status: triplet.status || "active",
      created_at: triplet.created_at || utcNowIso(),
      task_id: triplet.task_id || ""
    };
    const entries = index.triplets || [];
    const existingIndex = entries.findIndex((item) => item.triplet_id === triplet.triplet_id);
    if (existingIndex >= 0) entries[existingIndex] = entry;
    else entries.push(entry);
    index.triplets = entries;
    index.updated_at = utcNowIso();
    await writeJson(this.indexPath, index);
  }
}

export function extractTripletFields(args) {
  const situation = String(args.situation || "").trim();
  const judgment = String(args.judgment || "").trim();
  const structure = String(args.structure || "").trim();
  if (situation || judgment || structure) {
    if (!situation || !judgment || !structure) {
      return { error: "situation、judgment、structure 必须同时提供" };
    }
    return { situation, judgment, structure };
  }
  const content = String(args.content || "").trim();
  if (!content) return { error: "请提供 situation/judgment/structure，或旧格式 content='situation|judgment|structure'" };
  const parts = content.split("|", 3).map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => !part)) return { error: "content格式: 'situation|judgment|structure'" };
  return { situation: parts[0], judgment: parts[1], structure: parts[2] };
}

export function tripletSummary(triplet, maxChars = 300) {
  return {
    triplet_id: triplet.triplet_id,
    situation: compactText(triplet.situation, maxChars),
    judgment: compactText(triplet.judgment, maxChars),
    structure: compactText(triplet.structure, maxChars),
    tags: triplet.tags || [],
    track: triplet.track || "harness",
    status: triplet.status || "active",
    created_at: triplet.created_at || "",
    task_id: triplet.task_id || "",
    session_id: triplet.session_id || "",
    merged_from: triplet.merged_from || [],
    merge_reason: triplet.merge_reason || ""
  };
}

export function defaultTripletStore(rootDir) {
  return new TripletStore(rootDir || undefined);
}
