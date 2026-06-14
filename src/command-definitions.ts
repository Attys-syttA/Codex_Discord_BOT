import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("doctor")
    .setDescription("Show Discord bridge, worker, workspace mapping, and session health.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("session")
    .setDescription("Show the active Codex session for the current Discord context.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("workers")
    .setDescription("List configured worker targets.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("new")
    .setDescription("Create a new session placeholder for the current forum thread.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("attach")
    .setDescription("Attach an existing Codex thread ID to the current Discord thread.")
    .addStringOption((option) =>
      option
        .setName("thread_id")
        .setDescription("Existing Codex thread ID.")
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Send a prompt to the active Codex worker session.")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("Prompt text to send to Codex.")
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("handoff")
    .setDescription("Show resume metadata for the current Codex thread.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("abort")
    .setDescription("Abort the active worker session placeholder for this context.")
    .toJSON(),
];
