import { loadConfig } from "./config.js";
import { createDiscordClient, registerGuildCommands } from "./discord-bot.js";
import { loadEnvFile } from "./env.js";
import { FileSessionRegistry } from "./session-registry.js";

loadEnvFile();
const config = loadConfig();

console.log("Codex Discord bridge skeleton loaded", {
  applicationId: config.applicationId,
  guildId: config.guildId,
  allowedUsers: config.allowedUserIds.length,
  projectChannels: config.channelMappings.length,
  workers: config.workers.map((worker) => ({ id: worker.id, label: worker.label, baseUrl: worker.baseUrl })),
  defaultWorkerId: config.defaultWorkerId,
  sessionStorePath: config.sessionStorePath,
});

if (process.env.DISCORD_REGISTER_COMMANDS === "true") {
  await registerGuildCommands(config);
  console.log("Guild-scoped slash commands registered.");
}

if (process.env.DISCORD_LOGIN === "true") {
  const sessions = new FileSessionRegistry(config.sessionStorePath);
  const client = createDiscordClient(config, sessions);
  await client.login(config.discordToken);
}
