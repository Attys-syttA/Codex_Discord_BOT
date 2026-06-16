import { loadConfig } from "./config.js";
import { createDiscordClient, registerGuildCommands } from "./discord-bot.js";
import { SqliteStateStore } from "./db/sqlite-store.js";
import { loadDefaultEnvFiles } from "./env.js";

loadDefaultEnvFiles();
const config = loadConfig();

console.log("Codex Discord bridge skeleton loaded", {
  applicationId: config.applicationId,
  guildId: config.guildId,
  allowedUsers: config.allowedUserIds.length,
  projectChannels: config.channelMappings.length,
  autoWorkspaceRoot: config.autoWorkspaceRoot ?? "(disabled)",
  autoWorkspaceAliases: config.autoWorkspaceAliases.size,
  workers: config.workers.map((worker) => ({ id: worker.id, label: worker.label, baseUrl: worker.baseUrl })),
  defaultWorkerId: config.defaultWorkerId,
  databasePath: config.databasePath,
  queueMaxItems: config.queueMaxItems,
  enableMessagePrompts: config.enableMessagePrompts,
  sessionStorePath: config.sessionStorePath,
});

if (process.env.DISCORD_REGISTER_COMMANDS === "true") {
  await registerGuildCommands(config);
  console.log("Guild-scoped slash commands registered.");
}

if (process.env.DISCORD_LOGIN === "true") {
  const store = new SqliteStateStore({
    databasePath: config.databasePath,
    legacySessionStorePath: config.sessionStorePath,
  });
  const client = createDiscordClient(config, store);
  await client.login(config.discordToken);
}
