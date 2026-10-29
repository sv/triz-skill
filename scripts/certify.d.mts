/** Types for scripts/certify.mjs, which the tests import. */
export interface Message { severity: "error" | "warning" | "info"; line: number; text: string; }
/** `batched`: the run shared one Lean process with others (runLocalBatch). */
export interface Run { mode: "local" | "remote"; messages: Message[]; toolProblems: string[]; info?: unknown; batched?: boolean; }
export interface Verdict { ok: boolean; mode: "local" | "remote" | "grammar" | "binding"; certified: string[]; problems: string[]; info?: unknown; }
export interface Variant { name: string; content: string; mustFail: string[]; }
type Mode = { mode?: "local" | "remote" };
export interface TamperVerdict { ok: boolean; mode: "local" | "remote"; failed: number; problems: string[]; }
export interface Job { content: string; audit?: boolean; }
export interface BatchLayout { text: string; jobs: Array<{ prefix: string; start: number; last: number }>; }

export const THEORY_DIR: string;
export const AXLE_URL: string;
export const AXLE_ENVIRONMENT: string;
export const STANDARD_AXIOMS: string[];
export const NO_LOCAL_LEAN: string;
export function theorems(content: string): Array<{ name: string; short: string; depth: number; line: number }>;
export function code(src: string): string | null;
export function lint(content: string, opts?: { pinned?: boolean }): string[];
export function withAxioms(content: string): string;
export function localLeanAvailable(): boolean;
export function runLocal(content: string): Run;
export function batchFile(texts: string[]): BatchLayout;
export function splitBatch(layout: BatchLayout, messages: Message[], clean?: boolean): Array<Message[] | null>;
export function runLocalBatch(jobs: Job[]): Run[];
export function runRemote(content: string): Promise<Run>;
export function accept(content: string, run: Run): Verdict;
export function check(content: string, opts?: Mode): Promise<Verdict>;
export function checkAll(items: { certificates?: string[]; tampered?: Variant[] }, opts?: Mode): Promise<{ certificates: Verdict[]; tampered: TamperVerdict[]; batched: number }>;
export function tamperVariants(content: string): Variant[];
export function checkTampered(variant: Variant, opts?: Mode): Promise<TamperVerdict>;
export function rejected(variant: Variant, run: Run): TamperVerdict;

export function checkCorrespondence(content: string, request: import("../src/act-cert.js").CertificateRequest): string[];
export function bindRequest(content: string, request: import("../src/act-cert.js").CertificateRequest): string[];
export function checkRequest(content: string, request: import("../src/act-cert.js").CertificateRequest, opts?: Mode): Promise<Verdict>;
