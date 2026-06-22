import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as path from "node:path";
import { Agent } from "@oh-my-pi/pi-agent-core";
import { Effort } from "@oh-my-pi/pi-ai";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";
import { TempDir } from "@oh-my-pi/pi-utils";

/** Minimal AgentDefinition for persona tests — only the fields applyAgentPersona reads. */
function makePersona(name: string, systemPrompt: string, order?: number): AgentDefinition {
	return {
		name,
		description: `${name} agent`,
		systemPrompt,
		mode: "primary",
		order,
		source: "user" as const,
		tools: [],
	};
}

describe("AgentSession persona swap", () => {
	let tempDir: TempDir;
	let session: AgentSession;
	const authStorages: AuthStorage[] = [];

	beforeEach(() => {
		tempDir = TempDir.createSync("@pi-persona-");
	});

	afterEach(async () => {
		if (session) await session.dispose();
		for (const as of authStorages.splice(0)) as.close();
		tempDir.removeSync();
	});

	async function createSession(globalBlocks: string[] = ["global-block"]) {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("claude-sonnet-4-5 not found in bundled models");
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: globalBlocks,
				tools: [],
				messages: [],
				thinkingLevel: Effort.Low,
			},
		});
		const authStorage = await AuthStorage.create(path.join(tempDir.path(), "auth.db"));
		authStorages.push(authStorage);
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"));
		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated(),
			modelRegistry,
		});
	}

	it("starts with no active persona", async () => {
		await createSession();
		expect(session.activePersonaName).toBeNull();
	});

	it("applyAgentPersona sets system prompt to globalBlocks + HOW block", async () => {
		await createSession(["global-a", "global-b"]);
		const persona = makePersona("sisyphus", "HOW-sisyphus");

		await session.applyAgentPersona(persona);

		expect(session.systemPrompt).toEqual(["global-a", "global-b", "HOW-sisyphus"]);
	});

	it("applyAgentPersona sets activePersonaName", async () => {
		await createSession();
		await session.applyAgentPersona(makePersona("beta", "HOW-beta"));
		expect(session.activePersonaName).toBe("beta");
	});

	it("switching persona replaces HOW block, keeps global blocks", async () => {
		await createSession(["global"]);
		await session.applyAgentPersona(makePersona("sisyphus", "HOW-sisyphus"));
		await session.applyAgentPersona(makePersona("beta", "HOW-beta"));

		expect(session.systemPrompt).toEqual(["global", "HOW-beta"]);
		expect(session.activePersonaName).toBe("beta");
	});

	it("applyAgentPersona(null) resets to global blocks only", async () => {
		await createSession(["global"]);
		await session.applyAgentPersona(makePersona("sisyphus", "HOW-sisyphus"));
		await session.applyAgentPersona(null);

		expect(session.systemPrompt).toEqual(["global"]);
		expect(session.activePersonaName).toBeNull();
	});
	it("globalBlocks stays in sync with rebuilt prompt so persona swap uses current base (C1)", async () => {
		// Construct session with a rebuildSystemPrompt that returns an expanded base
		// (simulates what happens when MCP servers connect mid-session)
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("claude-sonnet-4-5 not found in bundled models");
		const agent = new Agent({
			initialState: { model, systemPrompt: ["initial"], tools: [], messages: [], thinkingLevel: Effort.Low },
		});
		const authStorage = await AuthStorage.create(path.join(tempDir.path(), "auth-c1.db"));
		authStorages.push(authStorage);
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models-c1.yml"));
		// Simulates a tool rebuild that adds MCP tool instructions to the base prompt
		const expandedBase = ["initial", "mcp-tool-instructions"];
		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated(),
			modelRegistry,
			rebuildSystemPrompt: async () => ({ systemPrompt: expandedBase }),
		});

		// Load initial persona
		await session.applyAgentPersona(makePersona("sisyphus", "HOW-sisyphus"));
		expect(session.systemPrompt).toEqual(["initial", "HOW-sisyphus"]);

		// Simulate MCP tool discovery / tool rebuild
		await session.refreshBaseSystemPrompt();
		expect(session.systemPrompt).toEqual(["initial", "mcp-tool-instructions", "HOW-sisyphus"]);

		// Switch to a different persona.
		// C1 regression: if #globalBlocks was not updated at refresh, applyAgentPersona
		// would reconstruct from the stale ["initial"] snapshot, producing
		// ["initial", "HOW-beta"] — dropping the MCP tool instructions.
		await session.applyAgentPersona(makePersona("beta", "HOW-beta"));
		expect(session.systemPrompt).toEqual(["initial", "mcp-tool-instructions", "HOW-beta"]);
	});
});

describe("applyAgentPersona — model behavior", () => {
	let tempDir: TempDir;
	let session: AgentSession;
	const authStorages: AuthStorage[] = [];

	beforeEach(() => {
		tempDir = TempDir.createSync("@pi-persona-model-");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (session) await session.dispose();
		for (const as of authStorages.splice(0)) as.close();
		tempDir.removeSync();
	});

	async function createSession() {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("claude-sonnet-4-5 not found in bundled models");
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: ["global-block"],
				tools: [],
				messages: [],
				thinkingLevel: Effort.Low,
			},
		});
		const authStorage = await AuthStorage.create(path.join(tempDir.path(), "auth.db"));
		authStorages.push(authStorage);
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"));
		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated(),
			modelRegistry,
		});
	}

	it("applies the first resolvable model from the persona's model list", async () => {
		await createSession();
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["anthropic/claude-opus-4-5"] };

		const result = await session.applyAgentPersona(persona);

		expect(result).toEqual({});
		expect(session.model?.id).toBe("claude-opus-4-5");
	});

	it("returns { modelFailed } and keeps current model when applyRoleModel throws", async () => {
		await createSession();
		const originalModelId = session.model?.id;
		vi.spyOn(session, "applyRoleModel").mockRejectedValue(new Error("forced failure"));
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["anthropic/claude-sonnet-4-5"] };

		const result = await session.applyAgentPersona(persona);

		expect(typeof result.modelFailed).toBe("string");
		// Persona HOW block still applies despite model failure
		expect(session.activePersonaName).toBe("beta");
		// Model is unchanged
		expect(session.model?.id).toBe(originalModelId);
	});

	it("records model_change entry for user-initiated cycle (default recordModelChange)", async () => {
		await createSession();
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["anthropic/claude-sonnet-4-5"] };

		await session.applyAgentPersona(persona);

		const branch = session.sessionManager.getBranch();
		const modelEntries = branch.filter(e => e.type === "model_change");
		expect(modelEntries.length).toBeGreaterThan(0);
	});

	it("does NOT record model_change when recordModelChange: false", async () => {
		await createSession();
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["anthropic/claude-sonnet-4-5"] };

		await session.applyAgentPersona(persona, { recordModelChange: false });

		const branch = session.sessionManager.getBranch();
		const modelEntries = branch.filter(e => e.type === "model_change");
		expect(modelEntries).toHaveLength(0);
	});

	it("does NOT record thinking_level_change when recordModelChange: false and persona has explicit thinking", async () => {
		await createSession();
		// :high gives explicitThinkingLevel: true; initial session level is Effort.Low so it IS changing
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["anthropic/claude-sonnet-4-5:high"] };

		await session.applyAgentPersona(persona, { recordModelChange: false });

		const branch = session.sessionManager.getBranch();
		const thinkingEntries = branch.filter(e => e.type === "thinking_level_change");
		expect(thinkingEntries).toHaveLength(0);
	});

	it("returns { modelFailed } when no model in the list can be resolved", async () => {
		await createSession();
		const originalModelId = session.model?.id;
		// Use a model string that will never match any available model (bad provider/id).
		const persona = { ...makePersona("beta", "HOW-beta"), model: ["nonexistent-provider/nonexistent-model-xyz"] };

		const result = await session.applyAgentPersona(persona);

		// modelFailed must be set even though no exception was thrown — the model just
		// couldn't be resolved from the registry.
		expect(typeof result.modelFailed).toBe("string");
		// Persona HOW block still applies.
		expect(session.activePersonaName).toBe("beta");
		// Model is unchanged.
		expect(session.model?.id).toBe(originalModelId);
	});
});
describe("applyAgentPersona — /agents override exclusivity", () => {
	let tempDir: TempDir;
	let session: AgentSession;
	const authStorages: AuthStorage[] = [];

	beforeEach(() => {
		tempDir = TempDir.createSync("@pi-persona-override-");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (session) await session.dispose();
		for (const as of authStorages.splice(0)) as.close();
		tempDir.removeSync();
	});

	async function createSessionWithOverride(agentName: string, overrideModel: string) {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("claude-sonnet-4-5 not found in bundled models");
		const agent = new Agent({
			initialState: { model, systemPrompt: ["global"], tools: [], messages: [], thinkingLevel: Effort.Low },
		});
		const authStorage = await AuthStorage.create(path.join(tempDir.path(), "auth.db"));
		authStorages.push(authStorage);
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"));
		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated({ "task.agentModelOverrides": { [agentName]: overrideModel } }),
			modelRegistry,
		});
	}

	it("does not fall through to frontmatter when /agents override fails to resolve", async () => {
		// Override is present but bogus — frontmatter model is real and would succeed.
		// The override must be treated as exclusive so the fallback never fires silently.
		await createSessionWithOverride("beta", "nonexistent-provider/nonexistent-model");
		const originalModelId = session.model?.id;
		const persona = {
			...makePersona("beta", "HOW-beta"),
			// Real model — would resolve if the loop continued past the override.
			model: ["anthropic/claude-opus-4-5"],
		};

		const result = await session.applyAgentPersona(persona);

		// Override failed → modelFailed must be set.
		expect(typeof result.modelFailed).toBe("string");
		// Persona HOW block still applied.
		expect(session.activePersonaName).toBe("beta");
		// Model unchanged — did NOT fall through to the frontmatter candidate.
		expect(session.model?.id).toBe(originalModelId);
	});

	it("applies /agents override when it resolves, ignoring frontmatter model", async () => {
		// Both override and frontmatter are real models; override should win.
		await createSessionWithOverride("beta", "anthropic/claude-opus-4-5");
		const persona = {
			...makePersona("beta", "HOW-beta"),
			model: ["anthropic/claude-sonnet-4-5"],
		};

		const result = await session.applyAgentPersona(persona);

		expect(result).toEqual({});
		// Override model applied, not the frontmatter model.
		expect(session.model?.id).toBe("claude-opus-4-5");
	});
});

describe("newSession — model recording", () => {
	let tempDir: TempDir;
	let session: AgentSession;
	const authStorages: AuthStorage[] = [];

	beforeEach(() => {
		tempDir = TempDir.createSync("@pi-new-session-");
	});

	afterEach(async () => {
		if (session) await session.dispose();
		for (const as of authStorages.splice(0)) as.close();
		tempDir.removeSync();
	});

	it("records current model in new session branch so resume can restore it", async () => {
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("claude-sonnet-4-5 not found in bundled models");
		const agent = new Agent({
			initialState: { model, systemPrompt: ["global"], tools: [], messages: [], thinkingLevel: Effort.Low },
		});
		const authStorage = await AuthStorage.create(path.join(tempDir.path(), "auth.db"));
		authStorages.push(authStorage);
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"));
		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated(),
			modelRegistry,
		});

		// Switch to a different model to simulate the "carry-over after persona switch" scenario.
		const opusModel = getBundledModel("anthropic", "claude-opus-4-5");
		if (!opusModel) throw new Error("claude-opus-4-5 not found in bundled models");
		await session.setModel(opusModel, "default");
		expect(session.model?.id).toBe("claude-opus-4-5");

		await session.newSession();

		// The new session branch must contain a model_change entry so resume can
		// restore claude-opus-4-5 rather than defaulting to startup state.
		const branch = session.sessionManager.getBranch();
		const modelEntries = branch.filter(e => e.type === "model_change") as Array<{ model: string }>;
		expect(modelEntries.length).toBeGreaterThan(0);
		const recorded = modelEntries[modelEntries.length - 1].model;
		expect(recorded).toBe("anthropic/claude-opus-4-5");
	});
});
