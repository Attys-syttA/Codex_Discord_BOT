import { describe, expect, it } from "vitest";

import {
  contextKeyFromIds,
  isThreadContextKey,
  parseContextKey,
  resolveProjectChannelId,
} from "../src/discord-context.js";

describe("Discord context keys", () => {
  it("creates project/forum context keys", () => {
    expect(contextKeyFromIds("100000000000000001", "100000000000000101")).toBe(
      "100000000000000001:100000000000000101",
    );
  });

  it("creates forum post/thread context keys", () => {
    expect(contextKeyFromIds("100000000000000001", "100000000000000101", "100000000000000201")).toBe(
      "100000000000000001:100000000000000101:100000000000000201",
    );
  });

  it("roundtrips parsed context keys", () => {
    const key = contextKeyFromIds("100000000000000001", "100000000000000101", "100000000000000201");
    const parsed = parseContextKey(key);

    expect(contextKeyFromIds(parsed.guildId, parsed.projectChannelId, parsed.threadId)).toBe(key);
  });

  it("detects thread context keys", () => {
    expect(isThreadContextKey("100000000000000001:100000000000000101")).toBe(false);
    expect(isThreadContextKey("100000000000000001:100000000000000101:100000000000000201")).toBe(true);
  });

  it("uses channel id as project channel for non-thread channels", () => {
    expect(resolveProjectChannelId({ channelId: "100000000000000101", isThread: false })).toBe(
      "100000000000000101",
    );
  });

  it("uses parent id as project channel for forum threads", () => {
    expect(resolveProjectChannelId({
      channelId: "100000000000000201",
      parentId: "100000000000000101",
      isThread: true,
    })).toBe("100000000000000101");
  });
});
