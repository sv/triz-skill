/** Types for scripts/certify.mjs, which the tests import. */
export interface Message { severity: "error" | "warning" | "info"; line: number; text: string; }
export interface Run { mode: "local" | "remote"; messages: Message[]; toolProblems: string[]; info?: unknown; }
export interface Verdict { ok: boolean; mode: "local" | "remote" | "grammar"; certified: string[]; problems: string[]; info?: unknown; }
export interface Variant { name: string; content: string; mustFail: string[]; }
type Mode = { mode?: "local" | "remote" };

export const THEORY_DIR: string;
export const AXLE_URL: string;
export const AXLE_ENVIRONMENT: string;
export const STANDARD_AXIOMS: string[];
export function theorems(content: string): Array<{ name: string; short: string; depth: number; line: number }>;
export function code(src: string): string | null;
export function lint(content: string): string[];
export function localLeanAvailable(): boolean;
export function runLocal(content: string): Run;
export function runRemote(content: string): Promise<Run>;
export function accept(content: string, run: Run): Verdict;
export function check(content: string, opts?: Mode): Promise<Verdict>;
export function tamperVariants(content: string): Variant[];
export function checkTampered(variant: Variant, opts?: Mode): Promise<{ ok: boolean; mode: "local" | "remote"; failed: number; problems: string[] }>;
