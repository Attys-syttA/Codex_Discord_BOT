import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  type Channel,
  type InteractionDeferReplyOptions,
  type InteractionReplyOptions,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
} from "discord.js";

import { commandDefinitions } from "./command-definitions.js";
import { handleBridgeCommand } from "./command-handlers.js";
import type { DiscordBridgeConfig } from "./config.js";
import { SessionRegistry } from "./session-registry.js";

export async function registerGuildCommands(config: DiscordBridgeConfig): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(
    Routes.applicationGuildCommands(config.applicationId, config.guildId),
    { body: commandDefinitions },
  );
}

export function createDiscordClient(
  config: DiscordBridgeConfig,
  sessions = new SessionRegistry(),
): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bridge logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.Error, (error) => {
    console.error(`Discord client error: ${error.message}`);
  });

  client.on(Events.Warn, (message) => {
    console.warn(`Discord client warning: ${message}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleChatInputInteraction(interaction, config, sessions);
  });

  return client;
}

async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
  config: DiscordBridgeConfig,
  sessions: SessionRegistry,
): Promise<void> {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  if (!guildId || !channel) {
    console.warn(`Discord command rejected outside guild/channel: command=${interaction.commandName} user=${interaction.user.id}`);
    await replySafely(interaction, {
      content: "This command must be used inside a configured Discord server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    console.log(
      `Discord command received: command=${interaction.commandName} guild=${guildId} channel=${channel.id} user=${interaction.user.id}`,
    );
    await interaction.deferReply(responseVisibility(config));
    console.log(
      `Discord command deferred: command=${interaction.commandName} guild=${guildId} channel=${channel.id} user=${interaction.user.id}`,
    );

    const parentId = "parentId" in channel ? channel.parentId : undefined;
    const channelName = readChannelName(channel);
    const parentName = parentId ? await resolveParentChannelName(interaction, parentId) : undefined;
    const response = await handleBridgeCommand(
      {
        commandName: interaction.commandName,
        guildId,
        channelId: channel.id,
        ...(channelName === undefined ? {} : { channelName }),
        ...(parentId === undefined ? {} : { parentId }),
        ...(parentName === undefined ? {} : { parentName }),
        isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
        userId: interaction.user.id,
        memberRoleIds: extractRoleIds(interaction.member),
        options: extractOptions(interaction),
      },
      { config, sessions },
    );

    const sentParts = await sendBridgeResponse(interaction, response.content, response.followUpContents, config);
    console.log(
      `Discord response sent: command=${interaction.commandName} guild=${guildId} channel=${channel.id} user=${interaction.user.id} parts=${sentParts}`,
    );
    console.log(
      `Discord command completed: command=${interaction.commandName} guild=${guildId} channel=${channel.id} user=${interaction.user.id}`,
    );
  } catch (error) {
    const content = `Command failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(
      `Discord command failed: command=${interaction.commandName} guild=${guildId} channel=${channel.id} user=${interaction.user.id}: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`,
    );
    if (interaction.deferred || interaction.replied) {
      await editReplySafely(interaction, content);
      return;
    }

    await replySafely(interaction, { content, flags: MessageFlags.Ephemeral });
  }
}

async function resolveParentChannelName(
  interaction: ChatInputCommandInteraction,
  parentId: string,
): Promise<string | undefined> {
  const cached = interaction.guild?.channels.cache.get(parentId);
  const cachedName = readChannelName(cached);
  if (cachedName) {
    return cachedName;
  }

  try {
    const fetched = await interaction.client.channels.fetch(parentId);
    return readChannelName(fetched);
  } catch (error) {
    console.warn(
      `Discord parent channel lookup failed: parent=${parentId} command=${interaction.commandName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function readChannelName(channel: Channel | null | undefined): string | undefined {
  if (!channel || !("name" in channel)) {
    return undefined;
  }

  const name = channel.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

async function replySafely(
  interaction: ChatInputCommandInteraction,
  payload: { content: string; flags: MessageFlags.Ephemeral },
): Promise<void> {
  try {
    await interaction.reply(payload);
  } catch (error) {
    logInteractionResponseFailure(interaction, "reply", error);
  }
}

async function editReplySafely(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  try {
    await interaction.editReply({ content });
  } catch (error) {
    logInteractionResponseFailure(interaction, "editReply", error);
  }
}

async function sendBridgeResponse(
  interaction: ChatInputCommandInteraction,
  content: string,
  followUpContents: string[],
  config: DiscordBridgeConfig,
): Promise<number> {
  await interaction.editReply({ content });

  for (const followUpContent of followUpContents) {
    await interaction.followUp({
      content: followUpContent,
      ...responseVisibility(config),
    });
  }

  return 1 + followUpContents.length;
}

function responseVisibility(config: DiscordBridgeConfig): Pick<InteractionDeferReplyOptions, "flags"> & Pick<InteractionReplyOptions, "flags"> {
  return config.ephemeralResponses ? { flags: MessageFlags.Ephemeral } : {};
}

function logInteractionResponseFailure(
  interaction: ChatInputCommandInteraction,
  action: "reply" | "editReply",
  error: unknown,
): void {
  console.error(
    `Discord interaction ${action} failed: command=${interaction.commandName} user=${interaction.user.id}: ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }`,
  );
}

function extractOptions(interaction: ChatInputCommandInteraction): Record<string, string | undefined> {
  const options: Record<string, string | undefined> = {};
  for (const option of interaction.options.data) {
    if (typeof option.value === "string") {
      options[option.name] = option.value;
    }
  }
  return options;
}

function extractRoleIds(member: ChatInputCommandInteraction["member"]): string[] {
  if (!member || !("roles" in member)) {
    return [];
  }

  const roles = member.roles;
  if (Array.isArray(roles)) {
    return roles;
  }

  return [...roles.cache.keys()];
}
