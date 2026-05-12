import fs from "node:fs/promises";
import path from "node:path";
import { autoSelectHarness, DEFAULT_CONFIDENCE } from "./autoSelect.mjs";
import { HarnessStore } from "./harnesses.mjs";
import { TripletStore, tripletSummary } from "./triplets.mjs";
import { PLUGIN_ROOT, compactText, ensureInitialized, readState, rememberSessionHarness, utcNowIso, writeState } from "./storage.mjs";

async function readPluginText(relativePath, fallback = "") {
  return fs.readFile(path.join(PLUGIN_ROOT, relativePath), "utf8").catch(() => fallback);
}

export async function buildHarnessManifest({ rootDir } = {}) {
  const store = new HarnessStore(rootDir);
  const harnesses = await store.list({ status: "active", limit: 80 });
  if (!harnesses.length) {
    return "## Harness Manifest\n\n当前没有可用 Harness3。必要时先记录 triplet，收敛后生成 harness。\n";
  }
  const lines = ["## Harness Manifest\n", "可用 Harness3（主动选择，不要为了显示切换而切换）：\n"];
  for (const h of harnesses) {
    lines.push(`- ${h.harness_id}: ${h.name} | category=${h.category} | tags=${(h.tags || []).slice(0, 14).join(", ")} | v${h.version}\n`);
  }
  return lines.join("");
}

export async function buildActiveHarnessInjection({ rootDir } = {}) {
  const state = await readState(rootDir);
  const harnessId = String(state.active_harness_id || "").trim();
  if (!harnessId) return "";
  const store = new HarnessStore(rootDir);
  const record = await store.get(harnessId);
  if (!record || record.status !== "active") return "";
  const md = await fs.readFile(path.join(store.harnessesDir, harnessId, "HARNESS.md"), "utf8").catch(() => "");
  const parts = ["## Active Harness\n\n"];
  parts.push(md || `Harness ${harnessId} is active.`);
  parts.push("\n\n此 harness 已激活。判断过程是主要参照，可执行方向是次要参照。两者都是方向，不是规则；当前情境不同就不要机械套用。\n");
  return parts.join("");
}

export async function buildOrientation(userMessage, { rootDir, maxTriplets = 3 } = {}) {
  const store = new TripletStore(rootDir);
  const results = (await store.search(userMessage, { limit: maxTriplets * 2, track: "harness" }))
    .filter((triplet) => triplet.status === "active")
    .slice(0, maxTriplets);
  if (!results.length) {
    return [
      "## Orientation\n",
      "③库当前没有匹配的 active triplet。处理本次任务时，注意自己的判断过程；只有可复用的判断理由才需要记录。\n",
      `当前任务：${compactText(userMessage, 500)}\n`
    ].join("\n");
  }
  const parts = [
    "## Orientation\n\n",
    "以下是过往判断参照。它们是方向，不是规则；指出注意力该往哪看，不规定该看到什么。\n\n"
  ];
  results.forEach((triplet, index) => {
    parts.push(`### 参照 ${index + 1}\n`);
    parts.push(`**情境**：${triplet.situation}\n`);
    parts.push(`**当时的判断过程**：${triplet.judgment}\n`);
    if (triplet.structure) parts.push(`**当时生成的方向**：${triplet.structure}\n`);
    parts.push("注意：这是当时的判断，不是你的指令。当前情境可能不同，用你自己的判断决定是否参考。\n\n");
  });
  parts.push(`当前任务：${compactText(userMessage, 500)}\n`);
  return parts.join("");
}

export async function maybeAutoActivate({ userMessage, sessionId = "", model = "", rootDir } = {}) {
  const state = await readState(rootDir);
  const setBy = state.active_set_by;
  if ((setBy === "user" || setBy === "model") && (state.active_harness_id || setBy === "model")) {
    rememberSessionHarness(state);
    await writeState(state, rootDir);
    return { decision: `sticky-${setBy}`, harness_id: state.active_harness_id || null };
  }
  const result = await autoSelectHarness(userMessage, { threshold: DEFAULT_CONFIDENCE, rootDir });
  const decision = {
    decision: result.harness_id ? "auto-activate" : "no-match",
    session_id: sessionId,
    model,
    harness_id: result.harness_id,
    score: Number(result.score.toFixed(2)),
    runner_up_id: result.runner_up_id,
    runner_up_score: Number(result.runner_up_score.toFixed(2)),
    matched_keywords: result.matched_keywords || [],
    threshold: DEFAULT_CONFIDENCE,
    user_message_excerpt: result.user_message_excerpt,
    decided_at: utcNowIso()
  };
  if (result.harness_id) {
    state.active_harness_id = result.harness_id;
    state.active_set_by = "auto";
    state.active_set_at = decision.decided_at;
  } else if (state.active_set_by !== "user") {
    delete state.active_harness_id;
    delete state.active_set_at;
    state.active_set_by = null;
  }
  state._activation_history = [...(state._activation_history || []), decision].slice(-20);
  rememberSessionHarness(state);
  await writeState(state, rootDir);
  return decision;
}

export async function buildSessionContext({ rootDir } = {}) {
  await ensureInitialized(rootDir);
  const root = await readPluginText("root/ROOT_PARADIGM.md");
  const soul = await readPluginText("root/SOUL.md");
  const manifest = await buildHarnessManifest({ rootDir });
  return [
    "# Jue Runtime Context",
    "以下是 Jue 判断系统上下文。它补充 Claude Code，不覆盖 Claude Code 原生安全、权限和工程规则。",
    "## ROOT_PARADIGM",
    root,
    "## SOUL",
    soul,
    manifest
  ].filter(Boolean).join("\n\n");
}

export async function buildTurnContext({ userMessage = "", sessionId = "", model = "", rootDir } = {}) {
  await ensureInitialized(rootDir);
  const decision = await maybeAutoActivate({ userMessage, sessionId, model, rootDir });
  const manifest = await buildHarnessManifest({ rootDir });
  const active = await buildActiveHarnessInjection({ rootDir });
  const orientation = await buildOrientation(userMessage, { rootDir });
  return [
    "# Jue Turn Context",
    `Auto harness decision: ${JSON.stringify(decision)}`,
    manifest,
    active,
    orientation
  ].filter(Boolean).join("\n\n");
}

export async function buildCompactContext({ userMessage = "", rootDir } = {}) {
  await ensureInitialized(rootDir);
  const state = await readState(rootDir);
  const active = state.active_harness_id || "";
  const parts = [
    "## Jue 连续性\n",
    "- 这是 Jue 判断连续性保护块，不是用户的新任务、待办或普通任务内容。\n",
    "- 压缩摘要必须保留 active harness、状态变化、triplet 线索和判断理由；不要把它改写成待办。\n",
    "- 完整 ROOT_PARADIGM / SOUL / active HARNESS.md 会在压缩后由 hooks 重新从文件注入。\n"
  ];
  if (active) {
    const store = new HarnessStore(rootDir);
    const record = await store.get(active);
    parts.push(`- 当前激活的 harness 除非显式变更，否则持续生效：${active}。\n`);
    if (record) {
      parts.push(`- 激活 harness 情境：${record.situation}\n`);
      parts.push(`- 激活 harness 判断过程：${record.judgment}\n`);
      parts.push(`- 激活 harness 方向：${record.structure}\n`);
    }
  }
  if (userMessage) {
    const store = new TripletStore(rootDir);
    const triplets = (await store.search(userMessage, { limit: 3, track: "harness" })).filter((t) => t.status === "active");
    if (triplets.length) {
      parts.push("- 相关判断三元组：\n");
      for (const triplet of triplets) {
        const summary = tripletSummary(triplet, 220);
        parts.push(`  - ${summary.triplet_id}: 情境=${summary.situation} | 判断过程=${summary.judgment} | 方向=${summary.structure}\n`);
      }
    }
  }
  return parts.join("");
}
