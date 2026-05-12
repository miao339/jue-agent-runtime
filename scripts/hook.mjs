import { buildCompactContext, buildSessionContext, buildTurnContext } from "../server/jue/context.mjs";
import {
  ensureInitialized,
  readState,
  rememberSessionHarness,
  restoreSessionHarness,
  sessionKeyFromPayload,
  utcNowIso,
  writeState
} from "../server/jue/storage.mjs";

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

function textFromHookInput(payload) {
  return String(
    payload.prompt ||
      payload.user_prompt ||
      payload.message ||
      payload.transcript_path ||
      payload.hook_event_name ||
      ""
  );
}

function eventNameForPhase(phase) {
  if (phase === "session-start") return "SessionStart";
  if (phase === "user-prompt-submit") return "UserPromptSubmit";
  if (phase === "pre-compact") return "PreCompact";
  if (phase === "post-tool-batch") return "PostToolBatch";
  return "UserPromptSubmit";
}

function outputAdditionalContext(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventNameForPhase(phase),
        additionalContext: context
      }
    })
  );
}

function sessionStartSource(payload) {
  return String(payload.source || payload.session_start_source || payload.sessionStartSource || "").trim();
}

async function prepareSessionStart(payload, rootDir) {
  const source = sessionStartSource(payload);
  const sessionKey = sessionKeyFromPayload(payload);
  const state = await readState(rootDir);

  if (source !== "startup") {
    if (restoreSessionHarness(state, sessionKey)) {
      state._activation_history = [
        ...(state._activation_history || []),
        {
          decision: "session-restore",
          session_key: sessionKey,
          harness_id: state.active_harness_id || undefined,
          decided_at: utcNowIso()
        }
      ].slice(-20);
      await writeState(state, rootDir);
      return;
    }
    if (sessionKey) {
      state.current_session_key = sessionKey;
      await writeState(state, rootDir);
    }
    return;
  }

  if (sessionKey) state.current_session_key = sessionKey;
  const previous = state.active_harness_id || null;
  const previousSetBy = state.active_set_by || null;
  delete state.active_harness_id;
  delete state.active_set_at;
  state.active_set_by = null;
  state._activation_history = [
    ...(state._activation_history || []),
    {
      decision: "startup-clear",
      previous,
      previous_set_by: previousSetBy,
      session_key: sessionKey || undefined,
      decided_at: utcNowIso()
    }
  ].slice(-20);
  rememberSessionHarness(state, sessionKey);
  await writeState(state, rootDir);
}

async function setCurrentSessionFromPayload(payload, rootDir) {
  const sessionKey = sessionKeyFromPayload(payload);
  if (!sessionKey) return;
  const state = await readState(rootDir);
  if (restoreSessionHarness(state, sessionKey) || state.current_session_key !== sessionKey) {
    state.current_session_key = sessionKey;
    await writeState(state, rootDir);
  }
}

const phase = process.argv[2] || "session-start";
const payload = await readStdinJson();
const rootDir = process.env.JUE_STATE_DIR;
await ensureInitialized(rootDir);

if (phase === "session-start") {
  await prepareSessionStart(payload, rootDir);
  outputAdditionalContext(await buildSessionContext({ rootDir }));
} else if (phase === "user-prompt-submit") {
  await setCurrentSessionFromPayload(payload, rootDir);
  outputAdditionalContext(
    await buildTurnContext({
      userMessage: textFromHookInput(payload),
      sessionId: payload.session_id || payload.sessionId || "",
      model: payload.model || "",
      rootDir
    })
  );
} else if (phase === "pre-compact") {
  outputAdditionalContext(await buildCompactContext({ userMessage: textFromHookInput(payload), rootDir }));
} else if (phase === "post-tool-batch") {
  outputAdditionalContext(await buildActiveHarnessInjectionSafe(rootDir));
} else {
  outputAdditionalContext("");
}

async function buildActiveHarnessInjectionSafe(rootDir) {
  const { buildActiveHarnessInjection } = await import("../server/jue/context.mjs");
  return buildActiveHarnessInjection({ rootDir });
}
