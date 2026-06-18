/**
 * Behavioral tests for InputController.cyclePersona — the Tab/Shift+Tab persona cycle.
 *
 * Oracle: the cycle contract as described in the feature and verified in the Round 2 review:
 *   - Primary agents (mode === "primary") are sorted by order asc, then alphabetically.
 *   - First Tab from no-persona loads index 0.
 *   - Shift+Tab from no-persona loads the last agent (I4).
 *   - Forward/backward wrap correctly.
 *   - Rapid Tab presses are debounced: the guard is synchronous, so a second call fired
 *     before the first await completes sees #personaCycleInFlight === true and returns early.
 *   - Non-primary agents are excluded from the rotation.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "bun:test";
import { InputController } from "@oh-my-pi/pi-coding-agent/modes/controllers/input-controller";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import * as discovery from "@oh-my-pi/pi-coding-agent/task/discovery";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";

beforeAll(() => {
	initTheme();
});

/** Minimal AgentDefinition for cycle tests. */
function makeAgent(name: string, mode: "primary" | "subagent" = "primary", order?: number): AgentDefinition {
	return {
		name,
		description: `${name} agent`,
		systemPrompt: `You are ${name}.`,
		mode,
		order,
		source: "user" as const,
	};
}

/** Three ordered primary agents used by most tests. */
const THREE_AGENTS = [
	makeAgent("alpha", "primary", 1),
	makeAgent("beta", "primary", 2),
	makeAgent("gamma", "primary", 3),
];

function createContext() {
	// Mutable state shared between the session mock and the test
	const state = { personaName: null as string | null };

	const applyAgentPersona = vi.fn(async (def: AgentDefinition | null) => {
		state.personaName = def?.name ?? null;
		return {};
	});

	const showStatus = vi.fn();
	const statusLine = { invalidate: vi.fn() };

	const ctx = {
		editor: {
			setActionKeys: vi.fn(),
		} as unknown as InteractiveModeContext["editor"],
		ui: { requestRender: vi.fn() } as unknown as InteractiveModeContext["ui"],
		statusLine: statusLine as unknown as InteractiveModeContext["statusLine"],
		session: {
			get activePersonaName() {
				return state.personaName;
			},
			applyAgentPersona,
			isStreaming: false,
			isCompacting: false,
			isGeneratingHandoff: false,
			isBashRunning: false,
			isEvalRunning: false,
			queuedMessageCount: 0,
			extensionRunner: undefined,
			prompt: vi.fn(async () => {}),
			abort: vi.fn(async () => {}),
			settings: { get: (key: string) => (key === "task.disabledAgents" ? [] : key === "task.agentModelOverrides" ? {} : undefined) },
		} as unknown as InteractiveModeContext["session"],
		sessionManager: {
			getCwd: () => "/tmp/test-cwd",
		} as unknown as InteractiveModeContext["sessionManager"],
		keybindings: { getKeys: () => [] } as unknown as InteractiveModeContext["keybindings"],
		showStatus,
		updateEditorTopBorder: vi.fn(),
		updateEditorBorderColor: vi.fn(),
		loadingAnimation: undefined,
		autoCompactionLoader: undefined,
		retryLoader: undefined,
		autoCompactionEscapeHandler: undefined,
		retryEscapeHandler: undefined,
		pendingImages: [],
		locallySubmittedUserSignatures: new Set<string>(),
		isKnownSlashCommand: () => false,
		recordLocalSubmission: () => () => {},
		withLocalSubmission: async <T>(_text: string, fn: () => Promise<T>) => fn(),
		updatePendingMessagesDisplay: vi.fn(),
		isBashMode: false,
		isPythonMode: false,
		handleHotkeysCommand: vi.fn(),
		handlePlanModeCommand: vi.fn(),
		handleClearCommand: vi.fn(),
		showTreeSelector: vi.fn(),
		showUserMessageSelector: vi.fn(),
		showSessionSelector: vi.fn(),
		handleSTTToggle: vi.fn(),
		showDebugSelector: vi.fn(),
		showHistorySearch: vi.fn(),
		toggleThinkingBlockVisibility: vi.fn(),
		showModelSelector: vi.fn(),
		hasActiveBtw: vi.fn(() => false),
		showError: vi.fn(),
	} as unknown as InteractiveModeContext;

	return { ctx, applyAgentPersona, showStatus, statusLine, state };
}

describe("InputController.cyclePersona", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("first Tab (no persona) loads the first primary agent sorted by order", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			// Deliberately out-of-order to prove sorting
			agents: [makeAgent("gamma", "primary", 3), makeAgent("alpha", "primary", 1), makeAgent("beta", "primary", 2)],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).toHaveBeenCalledTimes(1);
		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }));
	});

	it("advances to the next primary agent from the current persona", async () => {
		const { ctx, applyAgentPersona, state } = createContext();
		const controller = new InputController(ctx);
		state.personaName = "alpha";

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: THREE_AGENTS,
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "beta" }));
	});

	it("forward Tab wraps from the last agent back to the first", async () => {
		const { ctx, applyAgentPersona, state } = createContext();
		const controller = new InputController(ctx);
		state.personaName = "gamma";

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: THREE_AGENTS,
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }));
	});

	it("first Shift+Tab (no persona) loads the last primary agent — I4 contract", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: THREE_AGENTS,
			projectAgentsDir: null,
		});

		await controller.cyclePersona(-1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "gamma" }));
	});

	it("backward Shift+Tab wraps from the first agent to the last", async () => {
		const { ctx, applyAgentPersona, state } = createContext();
		const controller = new InputController(ctx);
		state.personaName = "alpha";

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: THREE_AGENTS,
			projectAgentsDir: null,
		});

		await controller.cyclePersona(-1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "gamma" }));
	});

	it("excludes subagent-mode agents from the cycle", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("worker", "subagent", 0), makeAgent("solo", "primary", 1)],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "solo" }));
		expect(applyAgentPersona).not.toHaveBeenCalledWith(expect.objectContaining({ name: "worker" }));
	});

	it("is a no-op when no primary agents exist", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("worker", "subagent")],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).not.toHaveBeenCalled();
	});

	it("sorts agents without an order value alphabetically after all ordered agents", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [
				makeAgent("zebra", "primary"), // no order — sorts last
				makeAgent("alpha", "primary", 1), // order: 1 — sorts first
			],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(applyAgentPersona).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }));
	});

	it("in-flight guard drops a concurrent second call — I1 contract", async () => {
		// The guard check and set are synchronous before the first await, so a second call
		// fired in the same synchronous turn will see #personaCycleInFlight === true and
		// return early — no real timer needed.
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		const { promise, resolve } = Promise.withResolvers<{ modelFailed?: string }>();
		applyAgentPersona.mockReturnValue(promise);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("alpha", "primary", 1), makeAgent("beta", "primary", 2)],
			projectAgentsDir: null,
		});

		// p1 sets #personaCycleInFlight = true synchronously before its first await;
		// p2 sees the guard and returns immediately.
		const p1 = controller.cyclePersona(1);
		const p2 = controller.cyclePersona(1);

		resolve({});
		await Promise.all([p1, p2]);

		expect(applyAgentPersona).toHaveBeenCalledTimes(1);
	});

	it("shows a status flash with the newly loaded persona name", async () => {
		const { ctx, showStatus } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("sisyphus", "primary", 1)],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(1);

		expect(showStatus).toHaveBeenCalledWith("Persona: sisyphus");
	});
});

describe("no-primary Shift+Tab preserves thinking-level cycle", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("cyclePersona(-1) returns early without applying a persona when no primary agents exist", async () => {
		const { ctx, applyAgentPersona } = createContext();
		const controller = new InputController(ctx);

		vi.spyOn(discovery, "discoverAgents").mockResolvedValue({
			agents: [makeAgent("worker", "subagent")],
			projectAgentsDir: null,
		});

		await controller.cyclePersona(-1);

		expect(applyAgentPersona).not.toHaveBeenCalled();
	});
});
