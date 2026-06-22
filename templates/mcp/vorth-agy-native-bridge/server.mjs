#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const SERVER_INFO = { name: "vorth-agy-native-bridge", version: "0.1.0" };
const META = { ideName: "antigravity", extensionName: "antigravity", locale: "en" };
const FLASH_HIGH_ID = "gemini-3-flash-agent";
const FLASH_HIGH_DISPLAY = "Gemini 3.5 Flash (High)";
const FLASH_HIGH_MODEL = "MODEL_PLACEHOLDER_M132";
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_TIMEOUT_MS = 300000;
const ALLOWED_MODES = new Set([
  "implementation",
  "build_fix",
  "tdd_green",
  "mechanical_refactor",
  "docs",
  "test_execution"
]);

const TOOLS = [
  {
    name: "vorth_agy_status",
    description: "Check whether a usable Antigravity workspace language server is available without returning secrets.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        userDataDir: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "vorth_agy_models",
    description: "List safe Antigravity model metadata and resolve the Gemini 3.5 Flash High model.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        userDataDir: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "vorth_agy_delegate",
    description: "Delegate a bounded task to Antigravity native cascade using the active OAuth session.",
    inputSchema: delegationSchema()
  },
  {
    name: "vorth_agy_read_result",
    description: "Read a previous Antigravity cascade result by cascadeId.",
    inputSchema: {
      type: "object",
      required: ["cascadeId"],
      properties: {
        cascadeId: { type: "string" },
        workspaceId: { type: "string" },
        userDataDir: { type: "string" },
        repoRoot: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "vorth_flash_high_execute",
    description: "Compatibility alias for vorth_agy_delegate with modelPreference defaulting to flash-high.",
    inputSchema: delegationSchema()
  }
];

function delegationSchema() {
  return {
    type: "object",
    required: ["repoRoot", "task"],
    properties: {
      repoRoot: { type: "string" },
      task: { type: "string" },
      mode: {
        type: "string",
        enum: [...ALLOWED_MODES]
      },
      modelPreference: { type: "string" },
      workspaceId: { type: "string" },
      userDataDir: { type: "string" },
      workspaceUri: { type: "string" },
      filesAllowed: {
        type: "array",
        items: { type: "string" }
      },
      filesForbidden: {
        type: "array",
        items: { type: "string" }
      },
      acceptanceCriteria: {
        type: "array",
        items: { type: "string" }
      },
      verificationCommands: {
        type: "array",
        items: { type: "string" }
      },
      context: { type: "string" },
      timeoutMs: { type: "number" },
      tags: {
        type: "array",
        items: { type: "string" }
      }
    },
    additionalProperties: false
  };
}

if (process.argv.includes("--self-test")) {
  const status = await toolStatus({});
  const models = status.ready ? await toolModels({}) : null;
  process.stdout.write(JSON.stringify({ status, flashHigh: models?.flashHigh ?? null }, null, 2));
  process.stdout.write("\n");
  process.exit(0);
}

let inputBuffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  drainInput().catch((error) => {
    process.stderr.write(`vorth-agy-native-bridge input error: ${safeErrorMessage(error)}\n`);
  });
});

async function drainInput() {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      continue;
    }

    const length = Number(lengthMatch[1]);
    const messageEnd = headerEnd + 4 + length;
    if (inputBuffer.length < messageEnd) return;

    const rawBody = inputBuffer.subarray(headerEnd + 4, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);

    let message;
    try {
      message = JSON.parse(rawBody);
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `Invalid JSON: ${safeErrorMessage(error)}` }
      });
      continue;
    }

    await handleMessage(message);
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== "object" || !message.method) return;
  if (message.id === undefined) return;

  try {
    const result = await routeMessage(message);
    writeMessage({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: error.code || -32000,
        message: safeErrorMessage(error)
      }
    });
  }
}

async function routeMessage(message) {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const name = message.params?.name;
      const args = message.params?.arguments || {};
      const result = await callTool(name, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    }
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default: {
      const error = new Error(`Unsupported method: ${message.method}`);
      error.code = -32601;
      throw error;
    }
  }
}

async function callTool(name, args) {
  switch (name) {
    case "vorth_agy_status":
      return toolStatus(args);
    case "vorth_agy_models":
      return toolModels(args);
    case "vorth_agy_delegate":
    case "vorth_flash_high_execute":
      return toolDelegate({ ...args, modelPreference: args.modelPreference || "flash-high" });
    case "vorth_agy_read_result":
      return toolReadResult(args);
    default: {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = -32602;
      throw error;
    }
  }
}

async function toolStatus(args) {
  const discovered = discoverLanguageServers(args);
  const candidates = discovered.map(publicServerInfo);
  const selected = selectLanguageServer(args, false);
  let heartbeat = null;
  let userStatus = null;

  if (selected) {
    try {
      const heartbeatResponse = await rpc(selected, "Heartbeat", {}, 5000);
      heartbeat = { ok: true, status: heartbeatResponse.status };
    } catch (error) {
      heartbeat = { ok: false, message: safeErrorMessage(error) };
    }

    try {
      const userStatusResponse = await rpc(selected, "GetUserStatus", { metadata: META }, 5000);
      userStatus = {
        ok: true,
        status: userStatusResponse.status,
        topKeys: Object.keys(userStatusResponse.body || {})
      };
    } catch (error) {
      userStatus = { ok: false, message: safeErrorMessage(error) };
    }
  }

  return {
    status: selected ? "ok" : "not_ready",
    ready: Boolean(selected && heartbeat?.ok),
    languageServerCount: discovered.length,
    usableLanguageServerCount: discovered.filter((item) => item.httpsPort && item.csrfToken).length,
    selected: selected ? publicServerInfo(selected) : null,
    candidates,
    heartbeat,
    userStatus
  };
}

async function toolModels(args) {
  const selected = requireLanguageServer(args);
  const { models, defaultAgentModelId } = await getModels(selected);
  const flashHigh = resolveModel("flash-high", models);
  return {
    status: "ok",
    defaultAgentModelId,
    flashHigh,
    models: models.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      model: model.model,
      thinkingBudget: model.thinkingBudget,
      minThinkingBudget: model.minThinkingBudget,
      apiProvider: model.apiProvider,
      modelProvider: model.modelProvider
    }))
  };
}

async function toolDelegate(args) {
  const mode = args.mode || "implementation";
  if (!ALLOWED_MODES.has(mode)) {
    return {
      status: "refused",
      summary: `Unsupported delegation mode: ${mode}`,
      questions: [`Choose one mode: ${[...ALLOWED_MODES].join(", ")}`]
    };
  }

  if (!args.task || !String(args.task).trim()) {
    return {
      status: "needs_context",
      summary: "Delegation requires a bounded task.",
      questions: ["Provide a complete task, file scope, and acceptance criteria."]
    };
  }

  const repoCheck = validateRepoRoot(args.repoRoot);
  if (!repoCheck.ok) return repoCheck.result;

  const selected = requireLanguageServer(args);
  const { models } = await getModels(selected);
  const resolvedModel = resolveModel(args.modelPreference || "flash-high", models);
  const cascadeId = args.cascadeId || randomUUID();
  const timeoutMs = clampTimeout(args.timeoutMs);
  const workspaceUri = args.workspaceUri || pathToFileURL(repoCheck.root).href;
  const cascadeConfig = {
    planner_config: {
      requested_model: { model: resolvedModel.model },
      use_ai_credits: true
    }
  };

  await rpc(selected, "StartCascade", {
    metadata: META,
    cascade_id: cascadeId,
    workspace_uris: [workspaceUri],
    source: "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
    trajectory_type: "CORTEX_TRAJECTORY_TYPE_CASCADE",
    cascade_config: cascadeConfig
  }, 15000);

  const prompt = buildDelegationPrompt(args, mode, resolvedModel);
  await rpc(selected, "SendUserCascadeMessage", {
    metadata: META,
    cascade_id: cascadeId,
    items: [{ text: prompt }],
    client_type: "CHAT_CLIENT_REQUEST_STREAM_CLIENT_TYPE_IDE",
    propagate_error: true,
    tags: ["vorth", "vorth-agy-native-bridge", mode, ...toStringArray(args.tags)],
    cascade_config: cascadeConfig
  }, 15000);

  await waitForIdleBestEffort(selected, cascadeId);
  const result = await readCascadeResult(selected, cascadeId, timeoutMs);
  return formatDelegateResult(result, cascadeId, resolvedModel, args);
}

async function toolReadResult(args) {
  if (args.repoRoot) {
    const repoCheck = validateRepoRoot(args.repoRoot);
    if (!repoCheck.ok) return repoCheck.result;
  }

  if (!args.cascadeId) {
    return {
      status: "needs_context",
      summary: "cascadeId is required.",
      questions: ["Pass the cascadeId returned by vorth_agy_delegate."]
    };
  }

  const selected = requireLanguageServer(args);
  const result = await readCascadeResult(selected, args.cascadeId, 5000);
  return formatReadResult(result, args.cascadeId);
}

function discoverLanguageServers(args = {}) {
  if (process.platform !== "win32") {
    return [];
  }

  const command = args.userDataDir
    ? "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"
    : "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'language_server_windows_x64.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  let rows;
  try {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024
    }).trim();
    rows = raw ? JSON.parse(raw) : [];
  } catch (error) {
    throw new Error(`Unable to inspect Antigravity language server processes: ${safeErrorMessage(error)}`);
  }

  if (!Array.isArray(rows)) rows = [rows];

  let languageServerRows = rows.filter((row) => row.Name === "language_server_windows_x64.exe" || !row.Name);
  if (args.userDataDir) {
    const needle = path.resolve(String(args.userDataDir)).toLowerCase();
    const selfRelated = collectSelfRelated(rows);
    const roots = rows
      .filter((row) => !selfRelated.has(row.ProcessId))
      .filter((row) => String(row.CommandLine || "").toLowerCase().includes(needle))
      .map((row) => row.ProcessId);
    const descendants = collectDescendants(rows, roots);
    languageServerRows = languageServerRows.filter((row) => descendants.has(row.ProcessId));
  }

  return languageServerRows.map((row) => {
    const commandLine = row.CommandLine || "";
    return {
      pid: row.ProcessId,
      parentPid: row.ParentProcessId,
      workspaceId: getArg(commandLine, "workspace_id"),
      httpsPort: Number(getArg(commandLine, "https_server_port") || 0),
      extensionPort: Number(getArg(commandLine, "extension_server_port") || 0),
      csrfToken: getArg(commandLine, "csrf_token")
    };
  });
}

function getArg(commandLine, name) {
  const pattern = new RegExp(`(?:^|\\s)--${escapeRegex(name)}(?:=|\\s+)(?:"([^"]*)"|(\\S+))`);
  const match = String(commandLine || "").match(pattern);
  return match ? (match[1] ?? match[2]) : undefined;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectDescendants(rows, rootIds) {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!ids.has(row.ProcessId) && ids.has(row.ParentProcessId)) {
        ids.add(row.ProcessId);
        changed = true;
      }
    }
  }
  return ids;
}

function collectSelfRelated(rows) {
  const related = collectDescendants(rows, [process.pid]);
  const byPid = new Map(rows.map((row) => [row.ProcessId, row]));
  let current = byPid.get(process.pid);
  while (current?.ParentProcessId) {
    related.add(current.ParentProcessId);
    current = byPid.get(current.ParentProcessId);
  }
  return related;
}

function selectLanguageServer(args = {}, throwIfMissing = true) {
  const discovered = discoverLanguageServers();
  let usable = discovered.filter((item) => item.httpsPort && item.csrfToken);
  if (args.workspaceId) {
    usable = usable.filter((item) => item.workspaceId === args.workspaceId);
  }

  const selected = usable[0] || null;
  if (!selected && throwIfMissing) {
    throw new Error("No usable Antigravity workspace language server found. Open the target repository in Antigravity and wait for the agent panel to initialize.");
  }

  return selected;
}

function requireLanguageServer(args = {}) {
  return selectLanguageServer(args, true);
}

function publicServerInfo(server) {
  return {
    pid: server.pid,
    parentPid: server.parentPid,
    workspaceId: server.workspaceId || null,
    hasHttps: Boolean(server.httpsPort),
    hasExtensionPort: Boolean(server.extensionPort)
  };
}

function rpc(server, method, body, timeoutMs = 30000) {
  const data = JSON.stringify(body || {});
  const options = {
    host: "127.0.0.1",
    port: server.httpsPort,
    path: `/exa.language_server_pb.LanguageServerService/${method}`,
    method: "POST",
    rejectUnauthorized: false,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "Connect-Protocol-Version": "1",
      "X-Codeium-Csrf-Token": server.csrfToken
    }
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let responseText = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseText += chunk;
      });
      response.on("end", () => {
        let parsed = {};
        try {
          parsed = responseText ? JSON.parse(responseText) : {};
        } catch {
          parsed = { raw: responseText.slice(0, 1000) };
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Antigravity RPC ${method} failed with HTTP ${response.statusCode}: ${safeRpcMessage(parsed)}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }

        resolve({ status: response.statusCode, body: parsed });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Antigravity RPC ${method} timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

async function getModels(server) {
  const response = await rpc(server, "GetAvailableModels", { metadata: META }, 15000);
  const root = response.body.response || response.body;
  const rawModels = root.models || {};
  const entries = Array.isArray(rawModels)
    ? rawModels.map((model, index) => [model.id || `model_${index}`, model])
    : Object.entries(rawModels);

  const models = entries.map(([id, model]) => ({
    id,
    displayName: model.displayName,
    model: model.model,
    thinkingBudget: model.thinkingBudget,
    minThinkingBudget: model.minThinkingBudget,
    apiProvider: model.apiProvider,
    modelProvider: model.modelProvider
  }));

  return {
    defaultAgentModelId: root.defaultAgentModelId || null,
    models
  };
}

function resolveModel(preference, models) {
  const normalized = String(preference || "flash-high").toLowerCase();

  if (String(preference || "").startsWith("MODEL_")) {
    const found = models.find((model) => model.model === preference);
    return found || { id: String(preference), displayName: String(preference), model: String(preference) };
  }

  if (["flash-high", "gemini-3.5-flash-high", "gemini-3-flash-agent"].includes(normalized)) {
    return (
      models.find((model) => model.id === FLASH_HIGH_ID) ||
      models.find((model) => model.displayName === FLASH_HIGH_DISPLAY) ||
      models.find((model) => model.model === FLASH_HIGH_MODEL) ||
      { id: FLASH_HIGH_ID, displayName: FLASH_HIGH_DISPLAY, model: FLASH_HIGH_MODEL }
    );
  }

  const byId = models.find((model) => model.id === preference);
  if (byId) return byId;

  const byDisplay = models.find((model) => String(model.displayName || "").toLowerCase() === normalized);
  if (byDisplay) return byDisplay;

  throw new Error(`Model preference not found: ${preference}`);
}

function validateRepoRoot(repoRoot) {
  if (!repoRoot) {
    return {
      ok: false,
      result: {
        status: "needs_context",
        summary: "repoRoot is required.",
        questions: ["Pass the absolute path to the Vorth-enabled repository."]
      }
    };
  }

  const root = path.resolve(String(repoRoot));
  const configPath = path.join(root, ".vorth", "vorth.config.md");
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      result: {
        status: "refused",
        summary: "Repository is not Vorth-enabled.",
        risks: ["Missing .vorth/vorth.config.md."],
        questions: ["Run /vorth init in this repository first."]
      }
    };
  }

  const configText = fs.readFileSync(configPath, "utf8");
  if (!/(agy_native_bridge|agy_flash_high_executor)\s*:\s*enabled/i.test(configText)) {
    return {
      ok: false,
      result: {
        status: "refused",
        summary: "Agy native bridge is not enabled for this repository.",
        risks: ["The bridge only accepts delegation from opted-in repositories."],
        questions: ["Set agy_native_bridge: enabled in .vorth/vorth.config.md after user approval."]
      }
    };
  }

  return { ok: true, root, configPath };
}

function buildDelegationPrompt(args, mode, resolvedModel) {
  const filesAllowed = toStringArray(args.filesAllowed);
  const filesForbidden = toStringArray(args.filesForbidden);
  const acceptanceCriteria = toStringArray(args.acceptanceCriteria);
  const verificationCommands = toStringArray(args.verificationCommands);
  const context = String(args.context || "").trim();

  return [
    "You are Vorth's bounded execution worker inside Antigravity.",
    `Use the requested model route: ${resolvedModel.displayName || resolvedModel.id || resolvedModel.model}.`,
    "Return only valid JSON matching this shape:",
    "{\"status\":\"ok|needs_context|refused|error\",\"summary\":\"short summary\",\"unifiedDiff\":\"patch text or empty string\",\"commandsSuggested\":[],\"risks\":[],\"questions\":[]}",
    "Do not make architecture decisions.",
    "Do not perform security review or final code review.",
    "Do not modify files directly. Return patch-only output unless the task is explicitly test_execution.",
    "Do not infer hidden context. Use only the task details below.",
    "",
    `Mode: ${mode}`,
    "",
    "Task:",
    String(args.task).trim(),
    "",
    "Allowed files:",
    formatList(filesAllowed),
    "",
    "Forbidden files:",
    formatList(filesForbidden),
    "",
    "Acceptance criteria:",
    formatList(acceptanceCriteria),
    "",
    "Verification commands suggested to the main agent:",
    formatList(verificationCommands),
    "",
    "Relevant context:",
    context || "- none"
  ].join("\n");
}

function formatList(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

async function waitForIdleBestEffort(server, cascadeId) {
  try {
    await rpc(server, "WaitForConversationFullyIdle", { metadata: META, cascade_id: cascadeId }, 30000);
  } catch {
    // Polling below is the authoritative path. Some runtimes return before the planner step is persisted.
  }
}

async function readCascadeResult(server, cascadeId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastTrajectory = null;
  let lastSteps = [];

  while (Date.now() <= deadline) {
    const stepsResponse = await rpc(server, "GetCascadeTrajectorySteps", { metadata: META, cascade_id: cascadeId }, 15000);
    lastSteps = stepsResponse.body.steps || [];
    const plannerStep = [...lastSteps].reverse().find((step) => step.plannerResponse);
    if (plannerStep) {
      return { status: "ok", plannerStep, steps: lastSteps, trajectory: lastTrajectory };
    }

    const errorStep = [...lastSteps].reverse().find((step) => step.errorMessage || step.error);
    const trajectoryResponse = await rpc(server, "GetCascadeTrajectory", { metadata: META, cascade_id: cascadeId }, 15000);
    lastTrajectory = trajectoryResponse.body;
    const runStatus = lastTrajectory.status || lastTrajectory.trajectory?.runStatus || "";

    if (errorStep || /IDLE|ERROR|FAILED|CANCELLED/.test(runStatus)) {
      return { status: "no_planner_response", errorStep, steps: lastSteps, trajectory: lastTrajectory };
    }

    await sleep(1500);
  }

  return { status: "timeout", steps: lastSteps, trajectory: lastTrajectory };
}

function formatDelegateResult(result, cascadeId, model, args) {
  if (result.status !== "ok") {
    return {
      status: "error",
      cascadeId,
      model: safeModel(model),
      summary: result.status === "timeout" ? "Timed out waiting for Antigravity planner response." : "Antigravity cascade did not return a planner response.",
      response: "",
      unifiedDiff: "",
      commandsSuggested: toStringArray(args.verificationCommands),
      risks: summarizeSteps(result.steps),
      questions: []
    };
  }

  const response = extractPlannerResponse(result.plannerStep);
  const parsed = parseJsonResponse(response);
  const unifiedDiff = valueAsString(parsed?.unifiedDiff || parsed?.diff) || extractDiff(response);

  return {
    status: parsed?.status || "ok",
    cascadeId,
    model: safeModel(model),
    summary: parsed?.summary || "Antigravity planner response received.",
    response,
    unifiedDiff,
    commandsSuggested: toStringArray(parsed?.commandsSuggested).length
      ? toStringArray(parsed.commandsSuggested)
      : toStringArray(args.verificationCommands),
    risks: toStringArray(parsed?.risks),
    questions: toStringArray(parsed?.questions),
    stepCount: result.steps.length
  };
}

function formatReadResult(result, cascadeId) {
  if (result.status !== "ok") {
    return {
      status: "error",
      cascadeId,
      summary: "No planner response is available for this cascade.",
      steps: summarizeSteps(result.steps)
    };
  }

  const response = extractPlannerResponse(result.plannerStep);
  const parsed = parseJsonResponse(response);
  return {
    status: parsed?.status || "ok",
    cascadeId,
    summary: parsed?.summary || "Antigravity planner response received.",
    response,
    unifiedDiff: valueAsString(parsed?.unifiedDiff || parsed?.diff) || extractDiff(response),
    commandsSuggested: toStringArray(parsed?.commandsSuggested),
    risks: toStringArray(parsed?.risks),
    questions: toStringArray(parsed?.questions),
    stepCount: result.steps.length
  };
}

function extractPlannerResponse(step) {
  return String(step?.plannerResponse?.modifiedResponse || step?.plannerResponse?.response || "").trim();
}

function parseJsonResponse(response) {
  const text = String(response || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function extractDiff(response) {
  const text = String(response || "");
  const fencedDiff = text.match(/```(?:diff|patch)\s*([\s\S]*?)```/i);
  if (fencedDiff) return fencedDiff[1].trim();

  const diffIndex = text.indexOf("diff --git ");
  if (diffIndex >= 0) return text.slice(diffIndex).trim();

  return "";
}

function summarizeSteps(steps = []) {
  return steps.slice(-6).map((step) => {
    const errorText = step.errorMessage?.errorMessage || step.error?.message || "";
    return [step.type || step.stepType || "unknown", step.status || "", errorText]
      .filter(Boolean)
      .join(": ")
      .slice(0, 500);
  });
}

function safeModel(model) {
  return {
    id: model.id || null,
    displayName: model.displayName || null,
    model: model.model || null,
    thinkingBudget: model.thinkingBudget,
    minThinkingBudget: model.minThinkingBudget
  };
}

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map(String);
  return [String(value)];
}

function valueAsString(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function clampTimeout(value) {
  const parsed = Number(value || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 1000), MAX_TIMEOUT_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeRpcMessage(parsed) {
  const message = parsed?.message || parsed?.raw || "unknown error";
  return redactSensitive(String(message)).slice(0, 1000);
}

function safeErrorMessage(error) {
  return redactSensitive(String(error?.message || error || "unknown error"));
}

function redactSensitive(text) {
  return String(text)
    .replace(/(--csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(--extension_csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(oauth|token|secret|csrf|cookie)[A-Za-z0-9_ .:=/-]{0,160}/gi, "$1<redacted>");
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}
