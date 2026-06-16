import type { ApprovalKind } from "../core/types.js";
import type { WorkerTarget } from "../config.js";

export interface WorkerEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface WorkerSessionInfo {
  threadId: string | null;
  workspace: string;
  model?: string;
  [key: string]: unknown;
}

export interface WorkerSessionCreateResponse {
  sessionId: string;
  info: WorkerSessionInfo;
}

export interface WorkerRepoStatus {
  workspace?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  clean?: boolean;
  summary?: string;
  [key: string]: unknown;
}

export interface WorkerNamedCheckResult {
  name: string;
  ok: boolean;
  summary: string;
  details?: string;
}

export interface WorkerLastResponse {
  text?: string;
  [key: string]: unknown;
}

export interface WorkerApprovalDecisionResult {
  [key: string]: unknown;
}

export type PromptStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string; toolCallId: string }
  | { type: "tool_update"; toolCallId: string; partialResult: string }
  | { type: "tool_end"; toolCallId: string; isError: boolean }
  | {
      type: "approval_request";
      approvalKind: ApprovalKind;
      payload: Record<string, unknown>;
      toolCallId?: string;
    }
  | { type: "turn_complete"; inputTokens?: number; cachedInputTokens?: number; outputTokens?: number }
  | { type: "agent_end" }
  | { type: "error"; message: string };

export interface PromptCallbacks {
  onTextDelta?: (delta: string) => void;
  onToolStart?: (toolName: string, toolCallId: string) => void;
  onToolUpdate?: (toolCallId: string, partialResult: string) => void;
  onToolEnd?: (toolCallId: string, isError: boolean) => void;
  onApprovalRequest?: (approvalKind: ApprovalKind, payload: Record<string, unknown>) => void;
  onTurnComplete?: (usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number }) => void;
  onAgentEnd?: () => void;
}

export interface WorkerClientOptions {
  worker: WorkerTarget;
  timeoutMs?: number;
}

export class WorkerClient {
  private readonly worker: WorkerTarget;
  private readonly timeoutMs: number;

  constructor(options: WorkerClientOptions) {
    this.worker = options.worker;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async getHealth(): Promise<Record<string, unknown>> {
    return this.requestJson("GET", "/health");
  }

  async createSession(options: Record<string, unknown> = {}): Promise<WorkerSessionCreateResponse> {
    return this.requestJson("POST", "/sessions/create", options);
  }

  async listSessions(): Promise<Array<{ sessionId: string; info?: WorkerSessionInfo }>> {
    return this.requestJson("GET", "/sessions");
  }

  async getSessionInfo(sessionId: string): Promise<WorkerSessionInfo> {
    return this.requestJson("GET", `/sessions/${encodeURIComponent(sessionId)}/info`);
  }

  async getSessionStatus(sessionId: string): Promise<Record<string, unknown>> {
    return this.requestJson("GET", `/sessions/${encodeURIComponent(sessionId)}/status`);
  }

  async newThread(sessionId: string, body: { workspace?: string; model?: string }): Promise<WorkerSessionInfo> {
    return this.requestJson("POST", `/sessions/${encodeURIComponent(sessionId)}/new-thread`, body);
  }

  async resumeThread(sessionId: string, threadId: string): Promise<WorkerSessionInfo> {
    return this.requestJson("POST", `/sessions/${encodeURIComponent(sessionId)}/resume`, { threadId });
  }

  async abort(sessionId: string): Promise<void> {
    await this.requestJson("POST", `/sessions/${encodeURIComponent(sessionId)}/abort`, {});
  }

  async getRepoStatus(sessionId: string): Promise<WorkerRepoStatus> {
    return this.requestJson("GET", `/sessions/${encodeURIComponent(sessionId)}/repo-status`);
  }

  async runNamedCheck(sessionId: string, name: string): Promise<WorkerNamedCheckResult> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const encodedName = encodeURIComponent(name);
    const resourcePath = name === "tests"
      ? `/sessions/${encodedSessionId}/checks/tests`
      : `/sessions/${encodedSessionId}/checks/${encodedName}`;
    return this.requestJson("POST", resourcePath, {});
  }

  async submitApprovalDecision(
    sessionId: string,
    body: { approvalId?: string; approved: boolean; scope?: "once" | "channel" },
  ): Promise<WorkerApprovalDecisionResult> {
    return this.requestJson("POST", `/sessions/${encodeURIComponent(sessionId)}/approval`, body);
  }

  async getLastResponse(sessionId: string): Promise<WorkerLastResponse> {
    return this.requestJson("GET", `/sessions/${encodeURIComponent(sessionId)}/last-response`);
  }

  async prompt(sessionId: string, input: unknown, callbacks: PromptCallbacks = {}): Promise<void> {
    const response = await this.fetch(`${this.baseUrl()}/sessions/${encodeURIComponent(sessionId)}/prompt`, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify(input),
    });

    if (!response.ok || !response.body) {
      throw new Error(await this.readError(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      buffered += decoder.decode(chunk.value, { stream: true });
      let newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (line) {
          this.handlePromptEvent(JSON.parse(line) as PromptStreamEvent, callbacks);
        }
        newlineIndex = buffered.indexOf("\n");
      }
    }

    const tail = buffered.trim();
    if (tail) {
      this.handlePromptEvent(JSON.parse(tail) as PromptStreamEvent, callbacks);
    }
  }

  private async requestJson<T>(method: string, resourcePath: string, body?: unknown): Promise<T> {
    const response = await this.fetch(`${this.baseUrl()}${resourcePath}`, {
      method,
      headers: body === undefined ? this.authHeaders() : this.jsonHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new Error(await this.readError(response));
    }

    const payload = await response.json() as WorkerEnvelope<T>;
    if (!payload.ok) {
      throw new Error(payload.error || "Remote worker request failed");
    }
    return payload.data as T;
  }

  private handlePromptEvent(event: PromptStreamEvent, callbacks: PromptCallbacks): void {
    switch (event.type) {
      case "text_delta":
        callbacks.onTextDelta?.(event.delta);
        break;
      case "tool_start":
        callbacks.onToolStart?.(event.toolName, event.toolCallId);
        break;
      case "tool_update":
        callbacks.onToolUpdate?.(event.toolCallId, event.partialResult);
        break;
      case "tool_end":
        callbacks.onToolEnd?.(event.toolCallId, event.isError);
        break;
      case "approval_request":
        callbacks.onApprovalRequest?.(event.approvalKind, event.payload);
        break;
      case "turn_complete":
        callbacks.onTurnComplete?.(compactUsage(event));
        break;
      case "agent_end":
        callbacks.onAgentEnd?.();
        break;
      case "error":
        throw new Error(event.message);
      default:
        break;
    }
  }

  private async readError(response: Response): Promise<string> {
    const text = (await response.text().catch(() => "")).trim();
    return text || `${response.status} ${response.statusText}`.trim();
  }

  private jsonHeaders(): Record<string, string> {
    return {
      ...this.authHeaders(),
      "content-type": "application/json",
    };
  }

  private authHeaders(): Record<string, string> {
    if (!this.worker.sharedSecret) {
      return {};
    }
    return { "x-telecodex-shared-secret": this.worker.sharedSecret };
  }

  private baseUrl(): string {
    return this.worker.baseUrl.replace(/\/+$/, "");
  }

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
  }
}

function compactUsage(
  event: Extract<PromptStreamEvent, { type: "turn_complete" }>,
): { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number } {
  return {
    ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
    ...(event.cachedInputTokens === undefined ? {} : { cachedInputTokens: event.cachedInputTokens }),
    ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
  };
}
