import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder().setName("doctor").setDescription("Show runtime, worker, queue, and storage health.").toJSON(),
  new SlashCommandBuilder().setName("status").setDescription("Show the current Discord context status.").toJSON(),
  new SlashCommandBuilder().setName("session").setDescription("Show the active Codex session for this context.").toJSON(),
  new SlashCommandBuilder()
    .setName("session-new")
    .setDescription("Create a new worker session and Codex thread for this context.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("session-resume")
    .setDescription("Attach an existing Codex thread ID to this context.")
    .addStringOption((option) =>
      option.setName("thread_id").setDescription("Existing Codex thread ID.").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("session-stop")
    .setDescription("Abort the current worker turn and mark the session stopped.")
    .toJSON(),
  new SlashCommandBuilder().setName("sessions").setDescription("List recent sessions for this project channel.").toJSON(),
  new SlashCommandBuilder().setName("last").setDescription("Show the last stored response preview for this context.").toJSON(),
  new SlashCommandBuilder().setName("workers").setDescription("List configured worker targets.").toJSON(),
  new SlashCommandBuilder()
    .setName("worker-bind")
    .setDescription("Bind the current project channel to a configured worker.")
    .addStringOption((option) =>
      option.setName("worker_id").setDescription("Configured worker ID.").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("register-workspace")
    .setDescription("Bind this project channel to a workspace and worker.")
    .addStringOption((option) =>
      option.setName("workspace").setDescription("Workspace path or repo-relative folder.").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("worker_id").setDescription("Configured worker ID.").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("unregister-workspace")
    .setDescription("Remove the explicit workspace binding from this project channel.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Inspect or clear the prompt queue for this context.")
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List queued prompts."))
    .addSubcommand((subcommand) => subcommand.setName("clear").setDescription("Clear queued prompts."))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("auto-approve")
    .setDescription("Turn per-channel auto-approve on or off.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("on or off")
        .setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
        ),
    )
    .toJSON(),
  new SlashCommandBuilder().setName("git-status").setDescription("Ask the worker for repository git status.").toJSON(),
  new SlashCommandBuilder().setName("run-tests").setDescription("Ask the worker to run its named test check.").toJSON(),
  new SlashCommandBuilder().setName("handoff").setDescription("Show the local resume command for this context.").toJSON(),
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Send a prompt to the active Codex worker session.")
    .addStringOption((option) =>
      option.setName("prompt").setDescription("Prompt text to send to Codex.").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder().setName("new").setDescription("Alias for /session-new.").toJSON(),
  new SlashCommandBuilder()
    .setName("attach")
    .setDescription("Alias for /session-resume.")
    .addStringOption((option) =>
      option.setName("thread_id").setDescription("Existing Codex thread ID.").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder().setName("abort").setDescription("Alias for /session-stop.").toJSON(),
];
