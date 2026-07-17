# Vorth Agy Native Bridge

Stable user-local MCP server for Vorth's Antigravity-only native OAuth delegation.

## Tools

- `vorth_agy_status`
- `vorth_agy_models`
- `vorth_agy_delegate`
- `vorth_agy_read_result`
- `vorth_flash_high_execute`

## Self Test

Run this after `vorth repair` installs the stable router:

```powershell
node $HOME\.vorth\bridge\server.mjs --self-test
```

The test prints safe readiness/model metadata only. It does not call the user-status RPC and must not print Antigravity command lines, CSRF tokens, OAuth tokens, or cookies.

Delegation requires an absolute Vorth-enabled `repoRoot`, repository-relative
`filesAllowed`, and explicit `acceptanceCriteria`. When multiple usable
Antigravity sessions exist, pass `workspaceId`; the bridge refuses to guess.
Returned patches are validated against the delegated file scope before they are
returned to the main agent.

## MCP Registration

Vorth uses Antigravity IDE's `--add-mcp` command after explicit harness approval.
The stable path avoids a registration that silently points to an old project.

Suggested entry:

```json
{
  "mcpServers": {
    "vorth-agy-native-bridge": {
      "command": "node",
      "args": ["<home>/.vorth/bridge/server.mjs"]
    }
  }
}
```

## Worker Profile

Initialize and authenticate the dedicated worker through the Vorth CLI:

```powershell
vorth bridge init --repo .
vorth bridge login --repo .
vorth bridge status
```

The helper persists data in `~/.vorth/agy-worker`, configures fixed runtime ports,
and discovers the Antigravity IDE CLI from `ANTIGRAVITY_IDE_CLI`, its standard
LocalAppData location, or `PATH`. The worker must be logged in interactively once;
readiness requires a language server exposing both HTTPS and CSRF runtime
arguments. The state file contains paths and ports only, never OAuth or CSRF data.
