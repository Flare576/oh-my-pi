import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
});
