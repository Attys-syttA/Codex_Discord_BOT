import type { DiscordBridgeConfig } from "../config.js";

export interface AccessInput {
  userId: string;
  memberRoleIds: string[];
}

export function isAllowedUser(input: AccessInput, config: DiscordBridgeConfig): boolean {
  if (config.allowedUserIdSet.has(input.userId)) {
    return true;
  }

  return input.memberRoleIds.some((roleId) => config.allowedRoleIdSet.has(roleId));
}
