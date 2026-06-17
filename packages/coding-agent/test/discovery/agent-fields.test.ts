import { describe, expect, test } from "bun:test";
import { Effort } from "@oh-my-pi/pi-ai";
import { parseAgentFields } from "@oh-my-pi/pi-coding-agent/discovery/helpers";

describe("parseAgentFields", () => {
	test("parses blocking from boolean frontmatter", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: true,
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBe(true);
	});

	test("parses blocking from string frontmatter", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: "false",
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBe(false);
	});

	test("ignores invalid blocking values", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: "sometimes",
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBeUndefined();
	});
	test("parses legacy thinking key", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			thinking: "medium",
		});

		expect(fields).toBeDefined();
		expect(fields?.thinkingLevel).toBe(Effort.Medium);
	});

	test("prefers thinking-level over legacy thinking", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			thinking: "minimal",
			thinkingLevel: Effort.High,
		});

		expect(fields?.thinkingLevel).toBe(Effort.High);
	});

	test("lowercases tool names", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			tools: ["Read", "Search"],
		});

		expect(fields?.tools).toEqual(["read", "search", "yield"]);
	});

	test("parses autoloadSkills from array frontmatter", () => {
		const fields = parseAgentFields({
			name: "oracle",
			description: "desc",
			autoloadSkills: ["user-created-skill-a", "user-created-skill-b"],
		});

		expect(fields).toBeDefined();
		expect(fields?.autoloadSkills).toEqual(["user-created-skill-a", "user-created-skill-b"]);
	});

	test("parses autoloadSkills from CSV string", () => {
		const fields = parseAgentFields({
			name: "oracle",
			description: "desc",
			autoloadSkills: "user-created-skill-a, user-created-skill-b",
		});

		expect(fields).toBeDefined();
		expect(fields?.autoloadSkills).toEqual(["user-created-skill-a", "user-created-skill-b"]);
	});

	test("returns undefined autoloadSkills when field absent", () => {
		const fields = parseAgentFields({
			name: "oracle",
			description: "desc",
		});

		expect(fields).toBeDefined();
		expect(fields?.autoloadSkills).toBeUndefined();
	});

	test("returns undefined autoloadSkills for empty array", () => {
		const fields = parseAgentFields({
			name: "oracle",
			description: "desc",
			autoloadSkills: [],
		});

		expect(fields).toBeDefined();
		expect(fields?.autoloadSkills).toBeUndefined();
	});

	test("parses readSummarize from boolean frontmatter", () => {
		expect(parseAgentFields({ name: "explore", description: "desc", readSummarize: false })?.readSummarize).toBe(
			false,
		);
		expect(parseAgentFields({ name: "explore", description: "desc", readSummarize: true })?.readSummarize).toBe(true);
	});

	test("parses readSummarize from string frontmatter", () => {
		expect(parseAgentFields({ name: "explore", description: "desc", readSummarize: "false" })?.readSummarize).toBe(
			false,
		);
	});

	test("ignores invalid readSummarize values", () => {
		expect(
			parseAgentFields({ name: "explore", description: "desc", readSummarize: "nope" })?.readSummarize,
		).toBeUndefined();
	});

	test("returns undefined readSummarize when field absent", () => {
		expect(parseAgentFields({ name: "explore", description: "desc" })?.readSummarize).toBeUndefined();
	});

	describe("mode field", () => {
		test("parses mode: primary", () => {
			const fields = parseAgentFields({ name: "sisyphus", description: "desc", mode: "primary" });
			expect(fields?.mode).toBe("primary");
		});

		test("parses mode: subagent", () => {
			const fields = parseAgentFields({ name: "explore", description: "desc", mode: "subagent" });
			expect(fields?.mode).toBe("subagent");
		});

		test("rejects invalid mode → undefined", () => {
			const fields = parseAgentFields({ name: "x", description: "d", mode: "primary2" });
			expect(fields?.mode).toBeUndefined();
		});

		test("returns undefined mode when field absent", () => {
			const fields = parseAgentFields({ name: "x", description: "d" });
			expect(fields?.mode).toBeUndefined();
		});
	});

	describe("order field", () => {
		test("parses finite integer order", () => {
			const fields = parseAgentFields({ name: "x", description: "d", order: 1 });
			expect(fields?.order).toBe(1);
		});

		test("parses fractional order", () => {
			const fields = parseAgentFields({ name: "x", description: "d", order: 1.5 });
			expect(fields?.order).toBe(1.5);
		});

		test("rejects string order → undefined", () => {
			const fields = parseAgentFields({ name: "x", description: "d", order: "1" });
			expect(fields?.order).toBeUndefined();
		});

		test("rejects NaN order → undefined", () => {
			const fields = parseAgentFields({ name: "x", description: "d", order: NaN });
			expect(fields?.order).toBeUndefined();
		});

		test("rejects Infinity order → undefined", () => {
			const fields = parseAgentFields({ name: "x", description: "d", order: Infinity });
			expect(fields?.order).toBeUndefined();
		});

		test("returns undefined order when field absent", () => {
			const fields = parseAgentFields({ name: "x", description: "d" });
			expect(fields?.order).toBeUndefined();
		});
	});
});
