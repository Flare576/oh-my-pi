/**
 * Contract tests for SelectorController.handleResumeSession persona restoration.
 *
 * Oracle: when a session is resumed, the controller must:
 *   1. Call applyAgentPersona with the agent whose name matches the session's
 *      last stamp (case-insensitive), falling back to the first primary agent
 *      when the stamp no longer resolves.
 *   2. Call applyAgentPersona(null) when no primary agents exist in the project.
 *   3. Always prefer the stamped agent over the default first-primary.
 */
import { afterEach, beforeAll, describe, expect, it, type Mock, vi } from "bun:test";
import { SelectorController } from "@oh-my-pi/pi-coding-agent/modes/controllers/selector-controller";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import * as discovery from "@oh-my-pi/pi-coding-agent/task/discovery";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";

beforeAll(() => {
	initTheme();
});

function makeAgent(name: string, mode: "primary" | "subagent" = "primary", order?: number): AgentDefinition {
	return {
		name,
		description: `${name} agent`,
		systemPrompt: `You are ${name}.`,
		mode,
		order,
		source: "user",
		tools: [],
	};
}

interface TestHandle {
	ctx: InteractiveModeContext;
	applyAgentPersona: Mock<(def: AgentDefinition | null) => Promise<{ modelFailed?: string }>>;
	getLastAgentName: Mock<() => string | undefined>;
}

function createHandle(lastAgentName: string | undefined = undefined): TestHandle {
	const applyAgentPersona = vi.fn(async () => ({}));
	const getLastAgentName = vi.fn(() => lastAgentName);

	const ctx = {
		clearTransientSessionUi: vi.fn(),
		session: {
			switchSession: vi.fn(async () => true),
			applyAgentPersona,
		},
		sessionManager: {
			getCwd: () => "/tmp/test-project",
			getLastAgentName,
		},
		applyCwdChange: vi.fn(async () => {}),
		chatContainer: { clear: vi.fn() },
		renderInitialMessages: vi.fn(),
		reloadTodos: vi.fn(async () => {}),
		showStatus: vi.fn(),
		showError: vi.fn(),
		statusLine: { invalidate: vi.fn() },
		updateEditorTopBorder: vi.fn(),
		updateEditorBorderColor: vi.fn(),
		ui: { requestRender: vi.fn() },
	} as unknown as InteractiveModeContext;

	return { ctx, applyAgentPersona, getLastAgentName };
}

describe("SelectorController.handleResumeSession — persona restore", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("restores the stamped agent when it still exists on disk", async () => {
		const { ctx, applyAgentPersona } = createHandle("beta");

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("alpha", "primary", 1), makeAgent("beta", "primary", 2)],
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledTimes(1);
		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "beta" }), {
			recordModelChange: false,
		});
	});

	it("stamp lookup is case-insensitive", async () => {
		const { ctx, applyAgentPersona } = createHandle("Beta"); // mixed case stamp

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("beta", "primary", 1)], // lowercase definition
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "beta" }), {
			recordModelChange: false,
		});
	});

	it("falls back to first primary when stamp does not match any known agent", async () => {
		const { ctx, applyAgentPersona } = createHandle("deleted-agent");

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("alpha", "primary", 1), makeAgent("beta", "primary", 2)],
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }), {
			recordModelChange: false,
		});
	});

	it("loads first primary when session has no stamp at all", async () => {
		const { ctx, applyAgentPersona } = createHandle(undefined); // no stamp

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("alpha", "primary", 1), makeAgent("beta", "primary", 2)],
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }), {
			recordModelChange: false,
		});
	});

	it("calls applyAgentPersona(null) when no primary agents exist", async () => {
		const { ctx, applyAgentPersona } = createHandle(undefined);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("worker", "subagent")], // only subagent — no primary
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledTimes(1);
		expect(applyAgentPersona).toHaveBeenCalledWith(null, { recordModelChange: false });
	});

	it("calls applyAgentPersona(null) when agent list is empty", async () => {
		const { ctx, applyAgentPersona } = createHandle(undefined);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [],
			projectAgentsDir: null,
		});

		const controller = new SelectorController(ctx);
		await controller.handleResumeSession("/tmp/test-project/sessions/session.jsonl");

		expect(applyAgentPersona).toHaveBeenCalledWith(null, { recordModelChange: false });
	});
});
