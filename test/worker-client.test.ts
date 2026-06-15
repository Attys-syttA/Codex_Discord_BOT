import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { WorkerClient } from "../src/worker-client.js";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("WorkerClient", () => {
  it("calls /health", async () => {
    const { baseUrl } = await startMockServer((req, res) => {
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/health");
      sendJson(res, 200, { ok: true, data: { mode: "remote-worker" } });
    });

    const client = new WorkerClient({ worker: { id: "otthon", label: "Otthon", baseUrl } });

    await expect(client.getHealth()).resolves.toEqual({ mode: "remote-worker" });
  });

  it("creates sessions with POST /sessions/create", async () => {
    const { baseUrl } = await startMockServer(async (req, res) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/sessions/create");
      expect(await readBody(req)).toBe("{}");
      sendJson(res, 200, {
        ok: true,
        data: { sessionId: "worker-session-1", info: { threadId: null, workspace: "E:\\workspace-home" } },
      });
    });

    const client = new WorkerClient({ worker: { id: "otthon", label: "Otthon", baseUrl } });

    await expect(client.createSession()).resolves.toMatchObject({ sessionId: "worker-session-1" });
  });

  it("sends the shared secret header when configured", async () => {
    const { baseUrl } = await startMockServer((req, res) => {
      expect(req.headers["x-telecodex-shared-secret"]).toBe("TEST_ONLY_WORKER_SHARED_SECRET");
      sendJson(res, 200, { ok: true, data: { ok: "yes" } });
    });

    const client = new WorkerClient({
      worker: {
        id: "otthon",
        label: "Otthon",
        baseUrl,
        sharedSecret: "TEST_ONLY_WORKER_SHARED_SECRET",
      },
    });

    await expect(client.getHealth()).resolves.toEqual({ ok: "yes" });
  });

  it("turns non-ok HTTP responses into errors", async () => {
    const { baseUrl } = await startMockServer((_req, res) => {
      sendText(res, 401, "Unauthorized worker request");
    });

    const client = new WorkerClient({ worker: { id: "otthon", label: "Otthon", baseUrl } });

    await expect(client.getHealth()).rejects.toThrow("Unauthorized worker request");
  });

  it("routes NDJSON prompt stream events into callbacks", async () => {
    const { baseUrl } = await startMockServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.write(`${JSON.stringify({ type: "text_delta", delta: "Szia" })}\n`);
      res.write(`${JSON.stringify({ type: "tool_start", toolName: "shell", toolCallId: "tool-1" })}\n`);
      res.write(`${JSON.stringify({ type: "tool_update", toolCallId: "tool-1", partialResult: "ok" })}\n`);
      res.write(`${JSON.stringify({ type: "tool_end", toolCallId: "tool-1", isError: false })}\n`);
      res.write(`${JSON.stringify({ type: "turn_complete", inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 })}\n`);
      res.write(`${JSON.stringify({ type: "agent_end" })}\n`);
      res.end();
    });

    const seen: string[] = [];
    const client = new WorkerClient({ worker: { id: "otthon", label: "Otthon", baseUrl } });

    await client.prompt("session-1", "hello", {
      onTextDelta: (delta) => seen.push(`text:${delta}`),
      onToolStart: (toolName, toolCallId) => seen.push(`start:${toolName}:${toolCallId}`),
      onToolUpdate: (toolCallId, partialResult) => seen.push(`update:${toolCallId}:${partialResult}`),
      onToolEnd: (toolCallId, isError) => seen.push(`end:${toolCallId}:${isError}`),
      onTurnComplete: (usage) => seen.push(`usage:${usage.inputTokens}:${usage.outputTokens}`),
      onAgentEnd: () => seen.push("agent_end"),
    });

    expect(seen).toEqual([
      "text:Szia",
      "start:shell:tool-1",
      "update:tool-1:ok",
      "end:tool-1:false",
      "usage:1:2",
      "agent_end",
    ]);
  });

  it("aborts slow requests after the configured timeout", async () => {
    const { baseUrl } = await startMockServer((_req, _res) => {
      // Intentionally never responds.
    });

    const client = new WorkerClient({
      worker: { id: "otthon", label: "Otthon", baseUrl },
      timeoutMs: 10,
    });

    await expect(client.getHealth()).rejects.toThrow();
  });
});

async function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<{ baseUrl: string }> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error: unknown) => {
      sendText(res, 500, error instanceof Error ? error.message : String(error));
    });
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server did not expose a TCP address");
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}
