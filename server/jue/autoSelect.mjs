import fs from "node:fs/promises";
import path from "node:path";
import { HarnessStore } from "./harnesses.mjs";

export const DEFAULT_CONFIDENCE = 6.0;

function tokenize(text) {
  const lower = String(text || "").toLowerCase();
  const words = new Set((lower.match(/[a-zA-Z0-9]+/g) || []).filter((word) => !/^\d+$/u.test(word)));
  const chars = new Set([...lower].filter((char) => char >= "一" && char <= "鿿"));
  return { words, chars };
}

function overlap(source, target, weight, label, matched) {
  const wordHits = [...source.words].filter((word) => target.words.has(word));
  const charHits = [...source.chars].filter((char) => target.chars.has(char));
  for (const word of wordHits) matched.push(`${label}:${word}`);
  const charScore = wordHits.length ? charHits.length * 0.1 : charHits.length * 0.3;
  return weight * (wordHits.length + charScore);
}

export async function autoSelectHarness(userMessage, { threshold = DEFAULT_CONFIDENCE, rootDir } = {}) {
  const excerpt = String(userMessage || "").trim().slice(0, 200);
  const empty = {
    harness_id: null,
    score: 0,
    runner_up_id: null,
    runner_up_score: 0,
    matched_keywords: [],
    user_message_excerpt: excerpt
  };
  if (excerpt.length < 3) return empty;

  const messageTokens = tokenize(excerpt);
  if (!messageTokens.words.size && !messageTokens.chars.size) return empty;

  const store = new HarnessStore(rootDir);
  await store.init();
  const entries = await fs.readdir(store.harnessesDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    const record = await store.get(entry.name);
    if (!record || record.status !== "active") continue;
    const harnessDir = path.join(store.harnessesDir, entry.name);
    const mdText = await fs.readFile(path.join(harnessDir, "HARNESS.md"), "utf8").catch(() => "");
    const matched = [];
    let score = 0;
    let strongScore = 0;
    const nameScore = overlap(messageTokens, tokenize(record.name), 8, "name", matched);
    const tagScore = overlap(messageTokens, tokenize((record.tags || []).join(" ")), 8, "tag", matched);
    const categoryScore = overlap(messageTokens, tokenize(record.category), 5, "category", matched);
    strongScore += nameScore + tagScore + categoryScore;
    score += strongScore;
    if (strongScore > 0) score += overlap(messageTokens, tokenize(mdText.slice(0, 1500)), 1, "md", matched);
    if (score > 0 && strongScore > 0) candidates.push({ score, harness_id: record.harness_id, matched });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return empty;
  const top = candidates[0];
  return {
    harness_id: top.score >= threshold ? top.harness_id : null,
    score: top.score,
    runner_up_id: candidates[1]?.harness_id || null,
    runner_up_score: candidates[1]?.score || 0,
    matched_keywords: top.matched.slice(0, 8),
    user_message_excerpt: excerpt
  };
}
