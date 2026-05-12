import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildActiveHarnessInjection, buildSessionContext, buildTurnContext } from "../server/jue/context.mjs";
import { riverHarness } from "../server/jue/tool.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "jue-test-"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runNodeScript(scriptPath, stdin, env = {}, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: PLUGIN_ROOT,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`script exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
    child.stdin.end(stdin);
  });
}

test("seeds code-craft and injects session context", async () => {
  const rootDir = await tempRoot();
  const result = await riverHarness({ action: "list_harnesses", status: "all" }, { rootDir });
  assert.equal(result.success, true);
  assert.ok(result.harnesses.some((harness) => harness.harness_id === "code-craft"));

  const context = await buildSessionContext({ rootDir });
  assert.match(context, /ROOT_PARADIGM/);
  assert.match(context, /SOUL/);
  assert.match(context, /code-craft/);
});

test("records, searches, merges, flags, and deletes triplets", async () => {
  const rootDir = await tempRoot();
  const recorded = await riverHarness(
    {
      action: "record_triplet",
      situation: "用户要删除目录，但里面有交接文档",
      judgment: "删除前要读附近上下文，因为字面目标可能覆盖仍有价值的状态",
      structure: "破坏性操作前先检查 README、notes、status 等上下文",
      tags: ["delete", "context", "保守"]
    },
    { rootDir }
  );
  assert.equal(recorded.success, true);

  const search = await riverHarness({ action: "search_triplets", query: "删除 交接", limit: 3 }, { rootDir });
  assert.equal(search.count, 1);

  const second = await riverHarness(
    {
      action: "record_triplet",
      situation: "用户要覆写配置，但没说明是否保留历史",
      judgment: "覆写前要确认历史用途，避免把运行时状态当临时文件",
      structure: "不可逆写入前先读状态来源，再决定是否询问",
      tags: ["overwrite", "context", "保守"]
    },
    { rootDir }
  );
  const merged = await riverHarness(
    {
      action: "merge_triplets",
      triplet_ids: [recorded.triplet_id, second.triplet_id],
      situation: "用户请求破坏性文件操作时",
      judgment: "先读上下文，因为字面目标可能没有呈现真实意图",
      structure: "破坏性操作前检查上下文；必要时问用户确认",
      tags: ["destructive", "context", "保守"]
    },
    { rootDir }
  );
  assert.equal(merged.success, true);

  const flagged = await riverHarness({ action: "flag_triplet", triplet_id: merged.triplet_id, status: "flagged" }, { rootDir });
  assert.equal(flagged.success, true);

  const deleted = await riverHarness({ action: "delete_triplet", triplet_id: merged.triplet_id, reason: "test cleanup", confirm_delete: true }, { rootDir });
  assert.equal(deleted.deleted, true);
});

test("unknown triplet track is normalized to harness", async () => {
  const rootDir = await tempRoot();
  const recorded = await riverHarness(
    {
      action: "record_triplet",
      situation: "用户提出看似简单但实现路径很多的需求",
      judgment: "简单不等于意图清楚，关键假设要先确认",
      structure: "先问技术栈、范围、界面偏好，再动手",
      tags: ["intent", "assumption"],
      track: "judgment"
    },
    { rootDir }
  );
  assert.equal(recorded.success, true);

  const listed = await riverHarness({ action: "list_triplets", limit: 5 }, { rootDir });
  assert.equal(listed.triplets[0].track, "harness");
});

test("generates, activates, evolves, and deactivates harnesses", async () => {
  const rootDir = await tempRoot();
  const ids = [];
  for (const n of [1, 2, 3]) {
    const result = await riverHarness(
      {
        action: "record_triplet",
      situation: `金融分析问题 ${n}: 用户询问投资判断`,
      judgment: "金融问题有时效性和风险，不能只靠记忆，要区分事实、假设和建议",
      structure: "先确认资产和日期，再查当前数据，最后说明风险和不确定性",
      tags: ["finance", "market", "金融", "风险"]
      },
      { rootDir }
    );
    ids.push(result.triplet_id);
  }

  const convergence = await riverHarness({ action: "check_convergence", query: "金融 投资 风险", limit: 10 }, { rootDir });
  assert.equal(convergence.convergence_detected, true);

  const generated = await riverHarness(
    {
      action: "generate_harness",
      triplet_ids: ids,
      name: "金融测试（finance-test）",
      category: "finance",
      tags: ["finance", "market", "金融", "风险"]
    },
    { rootDir }
  );
  assert.equal(generated.success, true);
  assert.equal(generated.harness_id, "finance-test");

  const active = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(active.active, true);
  assert.equal(active.harness_id, "finance-test");

  const evolved = await riverHarness(
    {
      action: "evolve_harness",
      harness_id: "finance-test",
      situation: "用户询问金融、投资、市场或风险判断问题",
      judgment: "先确认资产、日期和问题类型；高风险问题要提醒不构成投资建议；当前数据要查证。",
      structure: "确认资产与日期 -> 查当前数据 -> 区分事实、假设和建议 -> 给出谨慎结论",
      tags: ["finance", "market", "金融", "风险", "投资"],
      reason: "测试 rewrite 模式"
    },
    { rootDir }
  );
  assert.equal(evolved.mode, "rewrite");
  assert.equal(evolved.version, 2);

  const injection = await buildActiveHarnessInjection({ rootDir });
  assert.match(injection, /金融/);

  const deactivated = await riverHarness({ action: "deactivate_harness" }, { rootDir });
  assert.equal(deactivated.success, true);
  const inactive = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(inactive.active, false);
});

test("generating the same harness name refuses to overwrite existing harness", async () => {
  const rootDir = await tempRoot();
  const makeTriplet = async (suffix) => {
    const result = await riverHarness(
      {
        action: "record_triplet",
        situation: `重复领域 ${suffix}: 用户反复提出同名判断主体`,
        judgment: "生成 harness 时同名不应该覆盖已有目录，应该保留两个独立主体",
        structure: "同名生成使用唯一编号目录，避免 HARNESS.md 和 meta.json 相互覆盖",
        tags: ["duplicate", "harness", "编号"]
      },
      { rootDir }
    );
    return result.triplet_id;
  };

  const first = await riverHarness(
    {
      action: "generate_harness",
      triplet_ids: [await makeTriplet("A")],
      name: "重复测试（duplicate-test）",
      category: "test",
      tags: ["duplicate", "harness", "编号"]
    },
    { rootDir }
  );
  const second = await riverHarness(
    {
      action: "generate_harness",
      triplet_ids: [await makeTriplet("B")],
      name: "重复测试（duplicate-test）",
      category: "test",
      tags: ["duplicate", "harness", "编号"]
    },
    { rootDir }
  );

  assert.equal(first.success, true);
  assert.equal(first.harness_id, "duplicate-test");
  assert.equal(second.success, false);
  assert.match(second.error, /已存在/u);
});

test("turn context auto-activates code-craft from coding prompt", async () => {
  const rootDir = await tempRoot();
  const context = await buildTurnContext({ userMessage: "帮我修这个 Python bug，并加测试", rootDir });
  assert.match(context, /auto-activate/);
  assert.match(context, /code-craft/);
});

test("fresh session startup clears sticky harness and returns to auto mode", async () => {
  const rootDir = await tempRoot();
  const activated = await riverHarness({ action: "activate_harness", harness_id: "code-craft" }, { rootDir });
  assert.equal(activated.success, true);

  const output = await runNodeScript(path.join(PLUGIN_ROOT, "scripts", "hook.mjs"), JSON.stringify({ source: "startup" }), {
    JUE_STATE_DIR: rootDir
  });
  assert.match(output, /Jue Runtime Context/);

  const active = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(active.active, false);
});

test("resumed sessions keep their existing sticky harness", async () => {
  const rootDir = await tempRoot();
  const activated = await riverHarness({ action: "activate_harness", harness_id: "code-craft" }, { rootDir });
  assert.equal(activated.success, true);

  await runNodeScript(path.join(PLUGIN_ROOT, "scripts", "hook.mjs"), JSON.stringify({ source: "resume" }), {
    JUE_STATE_DIR: rootDir
  });

  const active = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(active.active, true);
  assert.equal(active.harness_id, "code-craft");
});

test("resumed historical session restores its harness after a fresh startup cleared global mode", async () => {
  const rootDir = await tempRoot();
  const hookPath = path.join(PLUGIN_ROOT, "scripts", "hook.mjs");

  await runNodeScript(hookPath, JSON.stringify({ source: "startup", session_id: "session-a" }), {
    JUE_STATE_DIR: rootDir
  });
  const activated = await riverHarness({ action: "activate_harness", harness_id: "code-craft" }, { rootDir });
  assert.equal(activated.success, true);

  await runNodeScript(hookPath, JSON.stringify({ source: "startup", session_id: "session-b" }), {
    JUE_STATE_DIR: rootDir
  });
  const cleared = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(cleared.active, false);

  await runNodeScript(hookPath, JSON.stringify({ source: "resume", session_id: "session-a" }), {
    JUE_STATE_DIR: rootDir
  });

  const restored = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(restored.active, true);
  assert.equal(restored.harness_id, "code-craft");
});

test("resumed historical session uses the last harness selected in that session", async () => {
  const rootDir = await tempRoot();
  const hookPath = path.join(PLUGIN_ROOT, "scripts", "hook.mjs");

  await runNodeScript(hookPath, JSON.stringify({ source: "startup", session_id: "session-a" }), {
    JUE_STATE_DIR: rootDir
  });
  const code = await riverHarness({ action: "activate_harness", harness_id: "code-craft" }, { rootDir });
  assert.equal(code.success, true);
  const law = await riverHarness({ action: "activate_harness", harness_id: "law" }, { rootDir });
  assert.equal(law.success, true);

  await runNodeScript(hookPath, JSON.stringify({ source: "startup", session_id: "session-b" }), {
    JUE_STATE_DIR: rootDir
  });
  const cleared = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(cleared.active, false);

  await runNodeScript(hookPath, JSON.stringify({ source: "resume", session_id: "session-a" }), {
    JUE_STATE_DIR: rootDir
  });

  const restored = await riverHarness({ action: "get_active_harness" }, { rootDir });
  assert.equal(restored.active, true);
  assert.equal(restored.harness_id, "law");
});

test("MCP stdio server lists and calls river_harness", async () => {
  const rootDir = await tempRoot();
  const client = new Client({ name: "jue-test-client", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(PLUGIN_ROOT, "server", "index.mjs")],
    cwd: PLUGIN_ROOT,
    env: {
      ...process.env,
      JUE_PLUGIN_ROOT: PLUGIN_ROOT,
      JUE_STATE_DIR: rootDir
    },
    stderr: "pipe"
  });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "river_harness"));
    const called = await client.callTool({
      name: "river_harness",
      arguments: { action: "list_harnesses", status: "all" }
    });
    const parsed = JSON.parse(called.content[0].text);
    assert.equal(parsed.success, true);
    assert.ok(parsed.harnesses.some((harness) => harness.harness_id === "code-craft"));
  } finally {
    await client.close();
  }
});

test("status line avoids duplicate agent and default labels", async () => {
  const rootDir = await tempRoot();
  const input = JSON.stringify({
    model: { display_name: "Sonnet" },
    workspace: { current_dir: "C:\\repo\\demo" },
    context_window: { used_percentage: 12.7 },
    agent: { name: "jue:jue" }
  });
  const output = await runNodeScript(path.join(PLUGIN_ROOT, "scripts", "statusline.mjs"), input, {
    JUE_STATE_DIR: rootDir
  });

  assert.match(output, /^⚖ 默认 \| Sonnet \| demo \| 13% ctx/u);
  assert.doesNotMatch(output, /jue:jue/u);
  assert.doesNotMatch(output, /默认 · 默认/u);
});
