import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteStateStore } from "../src/db/sqlite-store.js";

describe("SqliteStateStore", () => {
  it("stores and updates session metadata by Discord context key", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "codex-discord-db-"));
    const store = new SqliteStateStore({
      databasePath: join(tempDir, "bridge.sqlite"),
    });

    try {
      const metadata = store.upsertSession({
        contextKey: "100000000000000001:100000000000000101:100000000000000201",
        guildId: "100000000000000001",
        channelId: "100000000000000101",
        threadId: "100000000000000201",
        workspace: "C:\\workspace\\Codex_Discord_BOT",
        workerId: "worker-alpha",
        status: "idle",
      });

      expect(metadata.updatedAt).toEqual(expect.any(String));
      expect(store.getSession(metadata.contextKey)).toMatchObject({
        workspace: "C:\\workspace\\Codex_Discord_BOT",
        workerId: "worker-alpha",
      });

      store.upsertSession({
        ...metadata,
        codexThreadId: "codex-thread-1",
        status: "idle",
      });

      expect(store.getSession(metadata.contextKey)?.codexThreadId).toBe("codex-thread-1");
    } finally {
      store.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists queue items and approvals", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "codex-discord-db-"));
    const store = new SqliteStateStore({
      databasePath: join(tempDir, "bridge.sqlite"),
    });

    try {
      const queued = store.enqueuePrompt({
        contextKey: "guild:project:thread",
        discordUserId: "user-1",
        promptText: "Folytasd",
      });
      expect(store.listQueue("guild:project:thread")).toHaveLength(1);

      const approval = store.createApprovalRequest({
        contextKey: "guild:project:thread",
        workerId: "worker-1",
        approvalKind: "file_modification",
        payloadJson: "{\"path\":\"src/index.ts\"}",
      });
      expect(approval.status).toBe("pending");

      store.markQueueItemStatus(queued.id, "completed");
      store.resolveApprovalRequest(approval.id, "approved", "discord-user-1");

      expect(store.getQueueItem(queued.id)?.status).toBe("completed");
      expect(store.getApprovalRequest(approval.id)?.status).toBe("approved");
    } finally {
      store.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("expires pending approvals and lists audit log entries", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "codex-discord-db-"));
    const store = new SqliteStateStore({
      databasePath: join(tempDir, "bridge.sqlite"),
    });

    try {
      const approval = store.createApprovalRequest({
        contextKey: "guild:project:thread",
        workerId: "worker-1",
        approvalKind: "worker_question",
        payloadJson: "{\"q\":\"continue?\"}",
        createdAt: "2026-06-16T08:00:00.000Z",
      });

      expect(store.expirePendingApprovals("2026-06-16T08:30:00.000Z", "guild:project:thread")).toBe(1);
      expect(store.getApprovalRequest(approval.id)?.status).toBe("expired");

      store.appendAuditLog({
        contextKey: "guild:project:thread",
        action: "approval_expired",
        result: "expired",
        detailJson: JSON.stringify({ requestId: approval.id }),
      });

      expect(store.listAuditLog("guild:project:thread")).toHaveLength(1);
    } finally {
      store.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
