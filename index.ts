import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { initializeProseProfile } from "./src/profiles.ts";
import { registerProseTools } from "./src/tools.ts";

export default function piAgySuite(pi: ExtensionAPI): void {
  registerProseTools(pi);
  pi.registerCommand("agy-prose-init", {
    description: "Create a global or local prose profile without overwriting files",
    handler: async (args, ctx) => {
      const scope = args.trim();
      if (scope !== "global" && scope !== "local") {
        pi.sendMessage({
          customType: "pi-agy-suite",
          content: "Usage: /agy-prose-init global|local",
          display: true,
        });
        return;
      }

      const proseDir = scope === "global"
        ? join(getAgentDir(), "pi-agy-suite", "prose")
        : join(ctx.cwd, CONFIG_DIR_NAME, "pi-agy-suite", "prose");
      const result = await initializeProseProfile(proseDir);
      pi.sendMessage({
        customType: "pi-agy-suite",
        content: [
          ...result.created.map((path) => `Created: ${path}`),
          ...result.skipped.map((path) => `Skipped existing: ${path}`),
        ].join("\n"),
        display: true,
        details: result,
      });
    },
  });
}
