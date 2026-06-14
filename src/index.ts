import { loadConfig } from "./config.js";
import { createDiscordClient, registerGuildCommands } from "./discord-bot.js";
import { loadEnvFile } from "./env.js";

loadEnvFile();
const config = loadConfig();

console.log("Codex Discord bridge skeleton loaded", {
  applicationId: config.applicationId,
  guildId: config.guildId,
  allowedUsers: config.allowedUserIds.length,
  projectChannels: config.channelMappings.length,
  workers: config.workers.map((worker) => ({ id: worker.id, label: worker.label, baseUrl: worker.baseUrl })),
  defaultWorkerId: config.defaultWorkerId,
});

if (process.env.DISCORD_REGISTER_COMMANDS === "true") {
  await registerGuildCommands(config);
  console.log("Guild-scoped slash commands registered.");
}

if (process.env.DISCORD_LOGIN === "true") {
  const client = createDiscordClient(config);
  await client.login(config.discordToken);
}
