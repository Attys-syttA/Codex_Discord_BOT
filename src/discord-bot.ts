import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
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

  client.once("ready", (readyClient) => {
    console.log(`Discord bridge logged in as ${readyClient.user.tag}`);
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
    await interaction.reply({ content: "This command must be used inside a configured Discord server.", ephemeral: true });
    return;
  }

  try {
    const parentId = "parentId" in channel ? channel.parentId : undefined;
    const response = await handleBridgeCommand(
      {
        commandName: interaction.commandName,
        guildId,
        channelId: channel.id,
        ...(parentId === undefined ? {} : { parentId }),
        isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
        userId: interaction.user.id,
        memberRoleIds: extractRoleIds(interaction.member),
        options: extractOptions(interaction),
      },
      { config, sessions },
    );

    await interaction.reply(response);
  } catch (error) {
    await interaction.reply({
      content: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
      ephemeral: true,
    });
  }
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
