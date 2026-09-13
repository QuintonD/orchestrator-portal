// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
export interface ClientOptions { port?: number; secret: string; fetchImpl?: typeof fetch; timeoutMs?: number; brokerPublicKey?: string }
export type PhoneClient = (path: string, method?: 'GET' | 'POST' | 'DELETE', input?: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
export function clientToken(options: { tokenFile?: string; environment?: Record<string, string | undefined> }): string;
export function createClient(options: ClientOptions): PhoneClient;
export function isDefiniteRejection(error: unknown): boolean;
