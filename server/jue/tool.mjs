import { buildActiveHarnessInjection } from "./context.mjs";
import { HarnessStore, harnessIdFromName, harnessSummary } from "./harnesses.mjs";
import { TRIPLET_STATUSES, TripletStore, extractTripletFields, tripletSummary } from "./triplets.mjs";
import { normalizeTags, normalizeTrack, normalizeTripletIds, readState, rememberSessionHarness, safeInt, utcNowIso, writeState } from "./storage.mjs";

export const ACTIONS = [
  "record_triplet",
  "search_triplets",
  "list_triplets",
  "flag_triplet",
  "merge_triplets",
  "delete_triplet",
  "check_convergence",
  "generate_harness",
  "evolve_harness",
  "list_harnesses",
  "activate_harness",
  "deactivate_harness",
  "get_active_harness"
];

function ok(payload) {
  return { success: true, ...payload };
}

function fail(error, extra = {}) {
  return { success: false, error, ...extra };
}

async function setModelActiveHarness(harnessId, { decision, previous = undefined, rootDir } = {}) {
  const state = await readState(rootDir);
  const prev = previous === undefined ? state.active_harness_id || null : previous;
  if (harnessId) state.active_harness_id = harnessId;
  else delete state.active_harness_id;
  state.active_set_by = "model";
  state.active_set_at = utcNowIso();
  state._activation_history = [
    ...(state._activation_history || []),
    { decision, previous: prev, harness_id: harnessId || undefined, decided_at: state.active_set_at }
  ].slice(-20);
  rememberSessionHarness(state);
  await writeState(state, rootDir);
  return prev;
}

function filterTriplets(triplets, args) {
  let results = triplets;
  const status = String(args.status || "active");
  const tags = normalizeTags(args.tags);
  if (status && status !== "all") results = results.filter((triplet) => triplet.status === status);
  if (tags.length) {
    const wanted = new Set(tags);
    results = results.filter((triplet) => {
      const present = new Set(triplet.tags || []);
      return [...wanted].every((tag) => present.has(tag));
    });
  }
  return results;
}

async function tripletGovernanceReview(tStore, { harnessId, action, absorbedTripletIds, tags, queryText, limit = 8 }) {
  const absorbed = new Set(absorbedTripletIds);
  const candidates = new Map();
  const add = (triplet) => {
    if (!triplet || triplet.status !== "active" || absorbed.has(triplet.triplet_id)) return;
    const tagScore = normalizeTags(tags).filter((tag) => (triplet.tags || []).includes(tag)).length * 4;
    const queryTokens = new Set(String(queryText || "").toLowerCase().match(/[a-zA-Z0-9一-鿿]+/gu) || []);
    const text = `${triplet.situation} ${triplet.judgment} ${triplet.structure} ${(triplet.tags || []).join(" ")}`.toLowerCase();
    let score = tagScore;
    for (const token of queryTokens) if (token.length >= 2 && text.includes(token)) score += 1;
    if (score <= 0) return;
    const previous = candidates.get(triplet.triplet_id);
    if (!previous || score > previous.score) candidates.set(triplet.triplet_id, { score, triplet });
  };
  if (queryText?.trim()) {
    for (const triplet of await tStore.search(queryText, { limit: limit * 4, track: "harness" })) add(triplet);
  }
  for (const triplet of await tStore.list({ limit: 80, track: "harness", status: "active" })) add(triplet);
  const candidateTriplets = [...candidates.values()]
    .sort((a, b) => b.score - a.score || String(b.triplet.created_at).localeCompare(String(a.triplet.created_at)))
    .slice(0, limit)
    .map(({ triplet }) => tripletSummary(triplet, 220));
  return {
    triggered: true,
    action,
    harness_id: harnessId,
    absorbed_triplet_ids: absorbedTripletIds,
    candidate_count: candidateTriplets.length,
    candidate_triplets: candidateTriplets,
    required_before_final_response: true,
    guidance:
      "Do not clean mechanically. If a triplet is fully absorbed by HARNESS.md, mark it harnessed. If several active triplets repeat one judgment, merge them. If obsolete/redundant, revoke. Hard delete only for mistaken writes, corruption, or privacy.",
    next_actions: [
      "list_triplets(status='all')",
      "merge_triplets",
      "flag_triplet(status='harnessed')",
      "flag_triplet(status='revoked')",
      "delete_triplet(only privacy/corruption/mistake)"
    ]
  };
}

export async function riverHarness(args = {}, { rootDir } = {}) {
  const action = String(args.action || "").trim();
  const tStore = new TripletStore(rootDir);
  const hStore = new HarnessStore(rootDir);

  if (action === "record_triplet") {
    const fields = extractTripletFields(args);
    if (fields.error) return fail(fields.error);
    const tripletId = await tStore.write({
      ...fields,
      tags: args.tags,
      track: normalizeTrack(args.track),
      task_id: args.task_id || "",
      session_id: args.session_id || ""
    });
    return tripletId ? ok({ triplet_id: tripletId }) : fail("写入失败");
  }

  if (action === "search_triplets") {
    const limit = safeInt(args.limit, 5);
    const rawLimit = String(args.status || "active") === "all" ? limit : Math.max(limit * 3, limit);
    const results = filterTriplets(await tStore.search(args.query || "", { limit: rawLimit, track: args.track || null }), args).slice(0, limit);
    return ok({ count: results.length, triplets: results.map((triplet) => tripletSummary(triplet)) });
  }

  if (action === "list_triplets") {
    const limit = safeInt(args.limit, 20);
    const tags = normalizeTags(args.tags);
    const query = String(args.query || "").trim();
    const status = String(args.status || "active");
    let results;
    if (query) {
      const rawLimit = status === "all" ? limit : Math.max(limit * 3, limit);
      results = filterTriplets(await tStore.search(query, { limit: rawLimit, track: args.track || null }), args).slice(0, limit);
    } else {
      results = await tStore.list({ limit, track: args.track || null, status, tags });
    }
    return ok({ count: results.length, triplets: results.map((triplet) => tripletSummary(triplet)) });
  }

  if (action === "flag_triplet") {
    const tripletId = String(args.triplet_id || "").trim();
    const status = String(args.status || "flagged").trim();
    if (!tripletId) return fail("triplet_id 不能为空");
    if (!TRIPLET_STATUSES.has(status)) return fail(`status 必须是 ${[...TRIPLET_STATUSES].join(", ")}`);
    const changed = await tStore.updateStatus(tripletId, status);
    return ok({ triplet_id: tripletId, status: changed ? status : "unchanged" });
  }

  if (action === "merge_triplets") {
    const ids = normalizeTripletIds(args.triplet_ids);
    if (ids.length < 2) return fail("merge_triplets 至少需要 2 个 triplet_id");
    const triplets = [];
    for (const id of ids) {
      const triplet = await tStore.get(id);
      if (triplet) triplets.push(triplet);
    }
    if (triplets.length < 2) return fail("merge_triplets 未找到至少 2 个有效 triplet");
    const fields = extractTripletFields(args);
    if (fields.error) return fail(`merge_triplets 需要模型提供融合后的 situation/judgment/structure；${fields.error}`);
    const sourceStatus = String(args.source_status || "revoked").trim();
    if (!TRIPLET_STATUSES.has(sourceStatus) || sourceStatus === "active") return fail("source_status 必须是非 active 的有效状态，建议 revoked");
    let tags = normalizeTags(args.tags);
    if (!tags.length) tags = [...new Set(triplets.flatMap((triplet) => triplet.tags || []))];
    const tracks = new Set(triplets.map((triplet) => triplet.track).filter(Boolean));
    const track = normalizeTrack(args.track || (tracks.size === 1 ? [...tracks][0] : "harness"));
    const mergedId = await tStore.write({
      ...fields,
      tags,
      track,
      task_id: args.task_id || "",
      session_id: args.session_id || "",
      merged_from: triplets.map((triplet) => triplet.triplet_id),
      merge_reason: args.reason || ""
    });
    if (!mergedId) return fail("融合 triplet 写入失败");
    const changed = [];
    for (const triplet of triplets) {
      if (await tStore.updateStatus(triplet.triplet_id, sourceStatus)) changed.push(triplet.triplet_id);
    }
    return ok({ triplet_id: mergedId, merged_from: triplets.map((triplet) => triplet.triplet_id), source_status: sourceStatus, updated_sources: changed });
  }

  if (action === "delete_triplet") {
    const tripletId = String(args.triplet_id || "").trim();
    const reason = String(args.reason || "").trim();
    if (!tripletId) return fail("triplet_id 不能为空");
    if (!reason) return fail("硬删除必须提供 reason；普通冗余请用 merge_triplets 或 flag_triplet status=revoked");
    if (!args.confirm_delete) return fail("硬删除需要 confirm_delete=true；普通治理默认使用 revoked 软删除");
    return ok({ triplet_id: tripletId, deleted: await tStore.delete(tripletId), reason });
  }

  if (action === "check_convergence") {
    const active = (await tStore.search(args.query || "", { limit: safeInt(args.limit, 10), track: "harness" })).filter((triplet) => triplet.status === "active");
    if (active.length < 3) return { convergence_detected: false, reason: `同向active triplet不足（${active.length}<3）` };
    const common = active
      .map((triplet) => new Set(triplet.tags || []))
      .reduce((acc, tags) => new Set([...acc].filter((tag) => tags.has(tag))));
    return { convergence_detected: true, active_count: active.length, common_tags: [...common].sort(), triplet_ids: active.map((triplet) => triplet.triplet_id), suggestion: "同方向判断已收敛，建议 generate_harness" };
  }

  if (action === "generate_harness") {
    const ids = normalizeTripletIds(args.triplet_ids);
    if (!ids.length) return fail("triplet_ids 不能为空");
    const name = String(args.name || "").trim();
    if (!name) return fail("name 必填且不能为空。建议格式：法律（law）、代码（code-craft）。括号内英文会作为稳定 harness_id。");
    let tags = normalizeTags(args.tags);
    if (tags.length < 3) return fail("tags 至少需要 3 个，且必须既描述领域又包含触发关键词。中英混合更好。");
    const triplets = [];
    for (const id of ids) {
      const triplet = await tStore.get(id);
      if (triplet) triplets.push(triplet);
    }
    if (!triplets.length) return fail("未找到有效triplet");
    tags = [...new Set([...tags, ...triplets.flatMap((triplet) => triplet.tags || [])])].sort();
    const harnessId = harnessIdFromName(name);
    if (!harnessId) return fail(`name '${name}' 无法生成有效 harness_id`);
    if (await hStore.get(harnessId)) return fail(`harness_id '${harnessId}' 已存在。用 evolve_harness 在已有上进化，或换一个 name。`);
    const record = {
      harness_id: harnessId,
      name,
      category: String(args.category || "general").trim(),
      situation: triplets.map((triplet) => triplet.situation.slice(0, 400)).join("；"),
      judgment: triplets.map((triplet) => `- ${triplet.judgment.slice(0, 400)}`).join("\n\n"),
      structure: triplets.map((triplet) => `- ${triplet.structure.slice(0, 400)}`).join("\n\n"),
      tags,
      root_paradigm_fragment: String(args.root_paradigm_fragment || "").trim(),
      soul: String(args.soul || "").trim(),
      evolution_reason: "首次生成"
    };
    const written = await hStore.write(record);
    if (!written) return fail("写入失败");
    const absorbedIds = triplets.map((triplet) => triplet.triplet_id);
    for (const id of absorbedIds) await tStore.updateStatus(id, "harnessed");
    await setModelActiveHarness(written, { decision: "model-generate-activate", rootDir });
    const governance = await tripletGovernanceReview(tStore, {
      harnessId: written,
      action: "generate_harness",
      absorbedTripletIds: absorbedIds,
      tags,
      queryText: `${record.name} ${record.category} ${record.situation} ${record.judgment} ${record.structure} ${tags.join(" ")}`
    });
    return ok({ harness_id: written, name: record.name, category: record.category, tags, triplet_count: triplets.length, activated: true, triplet_governance: governance });
  }

  if (action === "evolve_harness") {
    const harnessId = String(args.harness_id || "").trim();
    if (!harnessId) return fail("harness_id 不能为空");
    const current = await hStore.get(harnessId);
    if (!current) return fail(`harness ${harnessId} 不存在`);
    const ids = normalizeTripletIds(args.triplet_ids);
    const triplets = [];
    for (const id of ids) {
      const triplet = await tStore.get(id);
      if (triplet) triplets.push(triplet);
    }
    const rewriteKeys = ["name", "category", "situation", "judgment", "structure", "tags", "root_paradigm_fragment", "soul", "evolution_direction"];
    const hasRewrite = rewriteKeys.some((key) => Object.hasOwn(args, key));
    if (ids.length && !triplets.length) return fail("evolve_harness 未找到有效triplet");
    if (!triplets.length && !hasRewrite) return fail("evolve_harness 需要至少 1 个有效triplet，或提供 situation/judgment/structure 等重写字段");

    const textOrCurrent = (key) => {
      if (!Object.hasOwn(args, key)) return current[key] || "";
      const value = String(args[key] || "").trim();
      if (!value && ["name", "category", "situation", "judgment", "structure"].includes(key)) {
        throw new Error(`${key} 不能为空`);
      }
      return value;
    };
    let next;
    try {
      next = {
        name: textOrCurrent("name"),
        category: textOrCurrent("category"),
        situation: textOrCurrent("situation"),
        judgment: textOrCurrent("judgment"),
        structure: textOrCurrent("structure"),
        root_paradigm_fragment: Object.hasOwn(args, "root_paradigm_fragment") ? String(args.root_paradigm_fragment || "").trim() : current.root_paradigm_fragment,
        soul: Object.hasOwn(args, "soul") ? String(args.soul || "").trim() : current.soul,
        evolution_direction: Object.hasOwn(args, "evolution_direction") ? String(args.evolution_direction || "").trim() : current.evolution_direction,
        tags: Object.hasOwn(args, "tags") ? normalizeTags(args.tags) : [...new Set([...(current.tags || []), ...triplets.flatMap((triplet) => triplet.tags || [])])].sort()
      };
    } catch (error) {
      return fail(error.message);
    }
    if (!hasRewrite && triplets.length) {
      next.situation = `${current.situation}；${triplets.map((triplet) => triplet.situation.slice(0, 300)).join("；")}`;
      next.judgment = `${current.judgment}\n\n${triplets.map((triplet) => `- ${triplet.judgment.slice(0, 300)}`).join("\n\n")}`;
      next.structure = `${current.structure}\n\n${triplets.map((triplet) => `- ${triplet.structure.slice(0, 300)}`).join("\n\n")}`;
    }
    const reason = String(args.reason || "").trim() || `v${current.version + 1}进化`;
    const evolved = await hStore.evolve(harnessId, next, reason);
    if (!evolved) return fail("写入失败");
    const absorbedIds = triplets.map((triplet) => triplet.triplet_id);
    for (const id of absorbedIds) await tStore.updateStatus(id, "harnessed");
    const governance = await tripletGovernanceReview(tStore, {
      harnessId: evolved,
      action: "evolve_harness",
      absorbedTripletIds: absorbedIds,
      tags: next.tags,
      queryText: `${next.name} ${next.category} ${next.situation} ${next.judgment} ${next.structure} ${next.tags.join(" ")}`
    });
    return ok({ harness_id: evolved, name: next.name, version: current.version + 1, triplet_count: triplets.length, mode: hasRewrite ? "rewrite" : "append", triplet_governance: governance });
  }

  if (action === "list_harnesses") {
    const status = args.status === "all" ? null : args.status || "active";
    const harnesses = await hStore.list({ status, category: args.category || null, track: args.track || null, limit: safeInt(args.limit, 20) });
    return ok({ count: harnesses.length, harnesses });
  }

  if (action === "activate_harness") {
    const harnessId = String(args.harness_id || "").trim();
    if (!harnessId) return fail("harness_id 不能为空");
    const record = await hStore.get(harnessId);
    if (!record) return fail(`harness ${harnessId} 不存在。用 list_harnesses 查可用。`);
    if (record.status !== "active") return fail(`harness ${harnessId} 不是 active 状态，不能激活。`);
    const previous = await setModelActiveHarness(harnessId, { decision: "model-set", rootDir });
    const referenceContent = await buildActiveHarnessInjection({ rootDir });
    return ok({ harness_id: harnessId, name: record.name, category: record.category, previous, reference_content: referenceContent, note: "已写入 state。Claude Code 下一次 hook 注入会重新读取 active HARNESS.md。" });
  }

  if (action === "deactivate_harness") {
    const previous = await setModelActiveHarness(null, { decision: "model-deactivate", rootDir });
    return ok({ previous, note: "已写入 state。Claude Code 下一次 hook 注入会回到主 SOUL。" });
  }

  if (action === "get_active_harness") {
    const state = await readState(rootDir);
    const harnessId = state.active_harness_id;
    if (!harnessId) return { active: false };
    const record = await hStore.get(harnessId);
    if (!record || record.status !== "active") return { active: false, message: `harness ${harnessId} 不存在或不是 active` };
    return { active: true, ...harnessSummary(record) };
  }

  return fail(`未知action: ${action}，可选: ${ACTIONS.join(", ")}`);
}
