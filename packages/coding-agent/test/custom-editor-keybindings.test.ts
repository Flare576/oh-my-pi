import { beforeAll, describe, expect, it, vi } from "bun:test";
import { CustomEditor } from "@oh-my-pi/pi-coding-agent/modes/components/custom-editor";
import { getEditorTheme, initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

describe("CustomEditor keybindings", () => {
	beforeAll(async () => {
		await initTheme();
	});

	it("routes the configured retry chord through handleInput", () => {
		const editor = new CustomEditor(getEditorTheme());
		const onRetry = vi.fn();

		editor.setActionKeys("app.retry", ["alt+shift+r"]);
		editor.onRetry = onRetry;
		editor.handleInput("\x1bR");

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("lets custom handlers keep precedence over the default retry chord", () => {
		const editor = new CustomEditor(getEditorTheme());
		const onRetry = vi.fn();
		const customHandler = vi.fn();

		editor.onRetry = onRetry;
		editor.setCustomKeyHandler("alt+r", customHandler);
		editor.handleInput("\x1br");

		expect(customHandler).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
	});

	it("lets copy-prompt remaps keep precedence over the default retry chord", () => {
		const editor = new CustomEditor(getEditorTheme());
		const onRetry = vi.fn();
		const onCopyPrompt = vi.fn();

		editor.onRetry = onRetry;
		editor.onCopyPrompt = onCopyPrompt;
		editor.setActionKeys("app.clipboard.copyPrompt", ["alt+r"]);
		editor.handleInput("\x1br");

		expect(onCopyPrompt).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
	});

	describe("persona cycle — Tab only fires on empty editor", () => {
		it("cycles forward on Tab when the editor is empty", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleForward = vi.fn();
			editor.onCyclePersonaForward = onCycleForward;
			editor.handleInput("\t");
			expect(onCycleForward).toHaveBeenCalledTimes(1);
		});

		it("does not cycle forward on Tab when the editor has text", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleForward = vi.fn();
			editor.onCyclePersonaForward = onCycleForward;
			editor.handleInput("/");
			editor.handleInput("\t");
			expect(onCycleForward).not.toHaveBeenCalled();
		});

		it("cycles backward on Shift+Tab when the editor is empty", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleBackward = vi.fn();
			editor.onCyclePersonaBackward = onCycleBackward;
			editor.handleInput("\x1b[Z");
			expect(onCycleBackward).toHaveBeenCalledTimes(1);
		});

		it("does not cycle backward on Shift+Tab when the editor has text", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleBackward = vi.fn();
			editor.onCyclePersonaBackward = onCycleBackward;
			editor.handleInput("h");
			editor.handleInput("\x1b[Z");
			expect(onCycleBackward).not.toHaveBeenCalled();
		});

		it("falls through to base Tab completion when onCyclePersonaForward returns false", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycle = vi.fn(() => false as false);
			editor.onCyclePersonaForward = onCycle;
			editor.handleInput("\t");
			// Callback fired once — the "no personas" signal was received
			expect(onCycle).toHaveBeenCalledTimes(1);
			// Base editor Tab completion opens a suggestion popup rather than inserting a
			// literal tab character, so the text buffer stays empty.
			expect(editor.getText()).toBe("");
		});

		it("falls through to thinking-level cycle when onCyclePersonaBackward returns false", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleBackward = vi.fn(() => false as false);
			const onCycleThinking = vi.fn();
			editor.onCyclePersonaBackward = onCycleBackward;
			editor.onCycleThinkingLevel = onCycleThinking;
			editor.handleInput("\x1b[Z"); // Shift+Tab
			expect(onCycleBackward).toHaveBeenCalledTimes(1);
			expect(onCycleThinking).toHaveBeenCalledTimes(1);
		});

		it("does NOT call thinking cycle when persona backward succeeds (returns undefined)", () => {
			const editor = new CustomEditor(getEditorTheme());
			const onCycleBackward = vi.fn(); // returns undefined — success
			const onCycleThinking = vi.fn();
			editor.onCyclePersonaBackward = onCycleBackward;
			editor.onCycleThinkingLevel = onCycleThinking;
			editor.handleInput("\x1b[Z");
			expect(onCycleBackward).toHaveBeenCalledTimes(1);
			expect(onCycleThinking).not.toHaveBeenCalled();
		});
	});
});
