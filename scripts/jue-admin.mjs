import { buildSessionContext } from "../server/jue/context.mjs";
import { riverHarness } from "../server/jue/tool.mjs";
import { ensureInitialized } from "../server/jue/storage.mjs";

const rootDir = process.env.JUE_STATE_DIR;
await ensureInitialized(rootDir);

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help") {
  console.log("Usage:");
  console.log("  npm run jue -- status");
  console.log("  npm run jue -- list");
  console.log("  npm run jue -- activate <harness_id>");
  console.log("  npm run jue -- deactivate");
  process.exit(0);
}

if (command === "status") {
  console.log(await buildSessionContext({ rootDir }));
} else if (command === "list") {
  console.log(JSON.stringify(await riverHarness({ action: "list_harnesses", status: "all" }, { rootDir }), null, 2));
} else if (command === "activate") {
  console.log(JSON.stringify(await riverHarness({ action: "activate_harness", harness_id: rest[0] }, { rootDir }), null, 2));
} else if (command === "deactivate") {
  console.log(JSON.stringify(await riverHarness({ action: "deactivate_harness" }, { rootDir }), null, 2));
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
