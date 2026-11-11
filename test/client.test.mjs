import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { DbbyteAgentClient } from "../src/client.ts";

function server() {
    const objs = new Map();
    const s = http.createServer(async (req, res) => {
        const u = new URL(req.url, "http://x");
        const send = (c, b, h = {}) => { res.writeHead(c, { "content-type": "application/json", ...h }); res.end(JSON.stringify(b)); };
        if (u.pathname === "/v1/agent/quote") return send(200, { amountCents: 1, amountUsd: "0.01" });
        if (u.pathname === "/v1/agent/objects" && req.method === "POST") {
            const chunks = []; for await (const c of req) chunks.push(c);
            if (req.headers.authorization !== "Payment ok") return send(402, { error: "pay" }, { "www-authenticate": "Payment realm=x" });
            const id = String(objs.size + 1);
            objs.set(id, Buffer.concat(chunks));
            return send(201, { id, url: `http://127.0.0.1:${s.address().port}/v1/agent/objects/${id}?token=t`, expiresAt: "2026-01-02T00:00:00Z", size: objs.get(id).length });
        }
        const m = /^\/v1\/agent\/objects\/(\w+)$/.exec(u.pathname);
        if (m && objs.has(m[1])) { res.writeHead(200, { "content-type": "text/plain" }); return res.end(objs.get(m[1])); }
        send(404, { error: "Not found" });
    });
    return new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
}

test("402 is surfaced with price, then paid retry stores and reads back", async () => {
    const s = await server();
    const base = `http://127.0.0.1:${s.address().port}`;
    const c = new DbbyteAgentClient({ baseUrl: base });
    const bytes = new TextEncoder().encode("hello");
    const first = await c.store(bytes, { name: "a.txt" });
    assert.equal(first.status, "payment_required");
    assert.equal(first.amountUsd, "0.01");
    const paid = await c.store(bytes, { name: "a.txt", paymentAuthorization: "Payment ok" });
    assert.equal(paid.status, "stored");
    const back = await c.read(paid.url);
    assert.equal(back.ok, true);
    assert.equal(new TextDecoder().decode(back.bytes), "hello");
    s.close();
});

test("read refuses URLs on other origins", async () => {
    const c = new DbbyteAgentClient({ baseUrl: "https://api.dbbyte.com", fetch: () => { throw new Error("should not fetch"); } });
    const r = await c.read("https://evil.example/x");
    assert.equal(r.ok, false);
});

test("unknown errors are reported, not thrown", async () => {
    const s = await server();
    const c = new DbbyteAgentClient({ baseUrl: `http://127.0.0.1:${s.address().port}`, paymentAuthorization: "Payment ok" });
    const r = await c.read(`http://127.0.0.1:${s.address().port}/v1/agent/objects/zzz`);
    assert.equal(r.ok, false);
    assert.equal(r.httpStatus, 404);
    s.close();
});
