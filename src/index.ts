import { loadConfig } from "./config.js";

const config = loadConfig();

console.log("Codex Discord bridge skeleton loaded", {
  applicationId: config.applicationId,
  guildId: config.guildId,
  allowedUsers: config.allowedUserIds.length,
  projectChannels: config.channelMappings.length,
  workers: config.workers.map((worker) => ({ id: worker.id, label: worker.label, baseUrl: worker.baseUrl })),
  defaultWorkerId: config.defaultWorkerId,
});
