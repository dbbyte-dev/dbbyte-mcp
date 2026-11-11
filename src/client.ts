// HTTP client for DBByte agent storage. No MCP types here, so it is unit-testable.

export interface ClientOptions {
    baseUrl?: string;
    fetch?: typeof fetch;
    // Value for the Authorization header produced by your payment client
    // (for example `Payment ...` from an MPP client). Optional.
    paymentAuthorization?: string;
}

export type StoreResult =
    | { status: "stored"; id: string; url: string; expiresAt: string; size: number }
    | { status: "payment_required"; amountUsd: string | null; challenge: string | null; docs: string }
    | { status: "error"; httpStatus: number; message: string };

const DOCS = "https://dbbyte.com/docs/agents";

export class DbbyteAgentClient {
    private base: string;
    private f: typeof fetch;
    private auth?: string;

    constructor(opts: ClientOptions = {}) {
        this.base = (opts.baseUrl ?? "https://api.dbbyte.com").replace(/\/+$/, "");
        this.f = opts.fetch ?? fetch;
        this.auth = opts.paymentAuthorization;
    }

    async quote(bytes: number, ttlSeconds?: number) {
        const q = new URLSearchParams({ bytes: String(bytes) });
        if (ttlSeconds) q.set("ttl", String(ttlSeconds));
        const res = await this.f(`${this.base}/v1/agent/quote?${q}`);
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false as const, message: body.error ?? `HTTP ${res.status}` };
        return { ok: true as const, ...body };
    }

    async store(bytes: Uint8Array, opts: { name?: string; ttlSeconds?: number; contentType?: string; paymentAuthorization?: string }): Promise<StoreResult> {
        const q = new URLSearchParams();
        if (opts.name) q.set("name", opts.name);
        if (opts.ttlSeconds) q.set("ttl", String(opts.ttlSeconds));
        const headers: Record<string, string> = { "content-type": opts.contentType ?? "application/octet-stream" };
        const auth = opts.paymentAuthorization ?? this.auth;
        if (auth) headers.authorization = auth;
        const res = await this.f(`${this.base}/v1/agent/objects?${q}`, { method: "POST", body: bytes as BodyInit, headers });
        if (res.status === 402) {
            const amount = await this.quote(bytes.byteLength, opts.ttlSeconds);
            return {
                status: "payment_required",
                amountUsd: amount.ok ? amount.amountUsd : null,
                challenge: res.headers.get("www-authenticate"),
                docs: DOCS,
            };
        }
        const body: any = await res.json().catch(() => ({}));
        if (res.status === 201 || res.status === 200) {
            return { status: "stored", id: body.id, url: body.url, expiresAt: body.expiresAt, size: body.size };
        }
        return { status: "error", httpStatus: res.status, message: body.error ?? `HTTP ${res.status}` };
    }

    async read(url: string): Promise<{ ok: true; bytes: Uint8Array; contentType: string } | { ok: false; httpStatus: number; message: string }> {
        const u = new URL(url);
        if (u.origin !== new URL(this.base).origin) {
            return { ok: false, httpStatus: 400, message: "URL is not a DBByte agent object URL." };
        }
        const res = await this.f(url);
        if (!res.ok) {
            const body: any = await res.json().catch(() => ({}));
            return { ok: false, httpStatus: res.status, message: body.error ?? `HTTP ${res.status}` };
        }
        return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    }
}
