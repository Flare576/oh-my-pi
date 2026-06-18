/**
 * Contract tests for SessionManager.getLastAgentName().
 *
 * Oracle: the method must return the agent name from the most-recently-appended
 * message that carries an agent stamp, or undefined when no stamped message
 * exists. This is the authoritative source used by the session-resume path to
 * restore the active persona.
 */
import { describe, expect, it } from "bun:test";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";

function userMsg() {
	return { role: "user" as const, content: "hello", timestamp: Date.now() };
}

describe("SessionManager.getLastAgentName", () => {
	it("returns undefined for an empty session", () => {
		const sm = SessionManager.inMemory();
		expect(sm.getLastAgentName()).toBeUndefined();
	});

	it("returns undefined when messages have no agent stamps", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg()); // no agent arg
		sm.appendMessage(userMsg()); // no agent arg
		expect(sm.getLastAgentName()).toBeUndefined();
	});

	it("returns the agent name from a stamped message", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg(), "sisyphus");
		expect(sm.getLastAgentName()).toBe("sisyphus");
	});

	it("returns the LAST stamped name — scans backward, not forward", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg(), "sisyphus");
		sm.appendMessage(userMsg(), "beta");
		// beta was appended last — it wins
		expect(sm.getLastAgentName()).toBe("beta");
	});

	it("skips unstamped messages after a stamped one and returns the stamp", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg(), "atlas");
		sm.appendMessage(userMsg()); // unstamped — must not shadow the earlier stamp
		expect(sm.getLastAgentName()).toBe("atlas");
	});

	it("returns the most recent stamp when stamps interleave with unstamped messages", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg(), "sisyphus");
		sm.appendMessage(userMsg()); // unstamped
		sm.appendMessage(userMsg(), "prometheus");
		sm.appendMessage(userMsg()); // unstamped
		expect(sm.getLastAgentName()).toBe("prometheus");
	});

	it("ignores non-message entries (model changes, thinking level changes)", () => {
		const sm = SessionManager.inMemory();
		sm.appendMessage(userMsg(), "sisyphus");
		// Append non-message entries after the stamped message
		sm.appendThinkingLevelChange("high");
		sm.appendModelChange("anthropic/claude-sonnet-4-5", "default");
		// Still returns the last STAMPED MESSAGE — non-message entries are invisible
		expect(sm.getLastAgentName()).toBe("sisyphus");
	});

	it("returns undefined after only non-message entries (no stamped messages at all)", () => {
		const sm = SessionManager.inMemory();
		sm.appendThinkingLevelChange("high");
		sm.appendModelChange("anthropic/claude-sonnet-4-5", "default");
		expect(sm.getLastAgentName()).toBeUndefined();
	});
});
