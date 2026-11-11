# @dbbyte/mcp

MCP server for DBByte pay-per-use agent storage. No account, no API key. Objects expire automatically (default 24h, max 7 days). About $0.01 per 10 MB per day, 25 MB max.

```json
{ "mcpServers": { "dbbyte": { "command": "npx", "args": ["-y", "@dbbyte/mcp"] } } }
```

## Tools
- `quote`: price an object without paying
- `store_object`: store text or base64, returns a private URL
- `read_object`: read an object by URL

## Payment
Storing requires an HTTP 402 payment over the Machine Payments Protocol (Stripe). Without payment, `store_object` returns `payment_required` with the price. Pass the Authorization header from your payment client as `paymentAuthorization` (or set `DBBYTE_PAYMENT_AUTHORIZATION`) and retry. Retrying with the same credential never charges twice.

This server does not hold funds or sign payments itself.

Docs: https://dbbyte.com/docs/agents
