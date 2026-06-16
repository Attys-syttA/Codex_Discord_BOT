import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  type Channel,
  type ChatInputCommandInteraction,
  type InteractionDeferReplyOptions,
  type InteractionReplyOptions,
  type Message,
} from "discord.js";

import { commandDefinitions } from "./command-definitions.js";
import type { DiscordBridgeConfig } from "../config.js";
import type { SqliteStateStore } from "../db/sqlite-store.js";
import { BridgeOrchestrator } from "../core/orchestrator.js";

export async function registerGuildCommands(config: DiscordBridgeConfig): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(
    Routes.applicationGuildCommands(config.applicationId, config.guildId),
    { body: commandDefinitions },
  );
}

export function createDiscordClient(
  config: DiscordBridgeConfig,
  store: SqliteStateStore,
): Client {
  const orchestrator = new BridgeOrchestrator({ config, store });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      ...(config.enableMessagePrompts ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : []),
    ],
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

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleChatInputInteraction(interaction, orchestrator, config);
        return;
      }

      if (interaction.isButton()) {
        await handleApprovalButton(interaction, orchestrator, config);
      }
    } catch (error) {
      console.error(`Discord interaction failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMessage(message, orchestrator);
    } catch (error) {
      console.error(`Discord message handler failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  });

  return client;
}

async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
  orchestrator: BridgeOrchestrator,
  config: DiscordBridgeConfig,
): Promise<void> {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  if (!guildId || !channel) {
    await replySafely(interaction, {
      content: "This command must be used inside a configured Discord server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply(responseVisibility(config));

  const parentId = "parentId" in channel ? channel.parentId : undefined;
  const channelName = readChannelName(channel);
  const parentName = parentId ? await resolveParentChannelName(interaction, parentId) : undefined;
  const options = extractOptions(interaction);
  if (interaction.options.getSubcommand(false)) {
    options.subcommand = interaction.options.getSubcommand(false) ?? undefined;
  }

  const response = await orchestrator.handleCommand({
    commandName: interaction.commandName,
    guildId,
    channelId: channel.id,
    ...(channelName === undefined ? {} : { channelName }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(parentName === undefined ? {} : { parentName }),
    isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
    userId: interaction.user.id,
    memberRoleIds: extractRoleIds(interaction.member),
    options,
  });

  await interaction.editReply({ content: response.content });
  for (const followUpContent of response.followUpContents) {
    await interaction.followUp({
      content: followUpContent,
      ...responseVisibility(config),
    });
  }
}

async function handleMessage(
  message: Message,
  orchestrator: BridgeOrchestrator,
): Promise<void> {
  if (message.author.bot || !message.guildId || !message.channel) {
    return;
  }

  const channel = message.channel;
  const parentId = "parentId" in channel ? channel.parentId : undefined;
  const parentName = parentId && "parent" in channel ? readChannelName(channel.parent ?? undefined) : undefined;
  const channelName = readChannelName(channel);
  const delivery = await orchestrator.handleMessage({
    guildId: message.guildId,
    channelId: channel.id,
    ...(channelName ? { channelName } : {}),
    ...(parentId === undefined ? {} : { parentId }),
    ...(parentName === undefined ? {} : { parentName }),
    isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
    userId: message.author.id,
    memberRoleIds: "roles" in message.member! && message.member?.roles ? [...message.member.roles.cache.keys()] : [],
    messageId: message.id,
    text: message.content.trim(),
  });

  if (!delivery) {
    return;
  }

  if (delivery.queued) {
    await message.reply(`A kontextus foglalt, ezért a kérés sorba került. Pozíció: ${delivery.queuePosition}.`);
    return;
  }

  const first = delivery.responseParts[0] ?? "(empty response)";
  const sent = await message.reply(first);
  for (const followUpContent of delivery.responseParts.slice(1)) {
    await message.reply(followUpContent);
  }

  if (delivery.approvalRequest) {
    const approvalMessage = await sent.reply({
      content: `Jóváhagyás szükséges: #${delivery.approvalRequest.id} (${delivery.approvalRequest.approvalKind})`,
      components: [approvalButtons(delivery.approvalRequest.id)],
    });
    orchestrator.attachApprovalMessage(delivery.approvalRequest.id, approvalMessage.id);
  }
}

async function handleApprovalButton(
  interaction: ButtonInteraction,
  orchestrator: BridgeOrchestrator,
  config: DiscordBridgeConfig,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || guildId !== config.guildId) {
    await interaction.reply({ content: "This approval action is not enabled here.", flags: MessageFlags.Ephemeral });
    return;
  }

  const match = /^approval:(approve|deny|auto):(\d+)$/.exec(interaction.customId);
  if (!match) {
    return;
  }

  const [, action, rawId] = match;
  const requestId = Number(rawId);
  const result = await orchestrator.handleApprovalDecision(
    requestId,
    action !== "deny",
    interaction.user.id,
    action === "auto",
  );
  await interaction.reply({
    content: result,
    ...responseVisibility(config),
  });
}

function approvalButtons(requestId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approval:approve:${requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`approval:deny:${requestId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`approval:auto:${requestId}`)
      .setLabel("Auto-approve for this channel")
      .setStyle(ButtonStyle.Secondary),
  );
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
  } catch {
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
    console.error(`Discord interaction reply failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function responseVisibility(config: DiscordBridgeConfig): Pick<InteractionDeferReplyOptions, "flags"> & Pick<InteractionReplyOptions, "flags"> {
  return config.ephemeralResponses ? { flags: MessageFlags.Ephemeral } : {};
}

function extractOptions(interaction: ChatInputCommandInteraction): Record<string, string | undefined> {
  const options: Record<string, string | undefined> = {};
  for (const option of interaction.options.data) {
    if (option.type === 1 && option.options) {
      for (const nested of option.options) {
        if (typeof nested.value === "string") {
          options[nested.name] = nested.value;
        }
      }
      continue;
    }
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
