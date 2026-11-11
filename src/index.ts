#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DbbyteAgentClient } from "./client.js";

const client = new DbbyteAgentClient({
    baseUrl: process.env.DBBYTE_API_URL,
    paymentAuthorization: process.env.DBBYTE_PAYMENT_AUTHORIZATION,
});

const server = new McpServer({ name: "dbbyte", version: "0.1.0" });
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

server.registerTool(
    "quote",
    {
        description: "Price a DBByte agent object without paying. About $0.01 per 10 MB per day, min $0.01. Max 25 MB, ttl 3600 to 604800 seconds.",
        inputSchema: { bytes: z.number().int().positive(), ttlSeconds: z.number().int().optional() },
    },
    async ({ bytes, ttlSeconds }) => {
        const q = await client.quote(bytes, ttlSeconds);
        return q.ok ? text(JSON.stringify(q)) : text(q.message, true);
    },
);

server.registerTool(
    "store_object",
    {
        description: "Store text or base64 data on DBByte with no account. Objects expire (default 24h, max 7 days). Returns a private URL. If payment is required the result says so and includes the price; retry with paymentAuthorization from your payment client.",
        inputSchema: {
            content: z.string().describe("Text content, or base64 when isBase64 is true"),
            isBase64: z.boolean().optional(),
            name: z.string().optional(),
            contentType: z.string().optional(),
            ttlSeconds: z.number().int().optional(),
            paymentAuthorization: z.string().optional().describe("Authorization header value from your payment client"),
        },
    },
    async ({ content, isBase64, name, contentType, ttlSeconds, paymentAuthorization }) => {
        const bytes = isBase64 ? new Uint8Array(Buffer.from(content, "base64")) : new TextEncoder().encode(content);
        const r = await client.store(bytes, { name, ttlSeconds, contentType: contentType ?? (isBase64 ? "application/octet-stream" : "text/plain"), paymentAuthorization });
        return text(JSON.stringify(r), r.status === "error");
    },
);

server.registerTool(
    "read_object",
    {
        description: "Read a DBByte agent object by the url returned from store_object. Text is returned as text; other types as base64.",
        inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
        const r = await client.read(url);
        if (!r.ok) return text(r.message, true);
        const isText = /^(text\/|application\/(json|xml))/.test(r.contentType);
        return text(isText ? new TextDecoder().decode(r.bytes) : JSON.stringify({ contentType: r.contentType, base64: Buffer.from(r.bytes).toString("base64") }));
    },
);

await server.connect(new StdioServerTransport());
