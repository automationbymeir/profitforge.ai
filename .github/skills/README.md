# Agent Skills

Agent Skills are self-contained folders with instructions and bundled resources that enhance AI capabilities for specialized tasks. Each skill contains a `SKILL.md` file with detailed instructions that agents load on-demand.

## Installed Skills

### gh-cli

GitHub CLI comprehensive reference for repositories, issues, pull requests, Actions, projects, releases, gists, codespaces, organizations, and extensions.

**Triggers:** Working with GitHub, gh commands, repositories, issues, PRs, Actions  
**Use For:** Creating issues, managing PRs, repository operations, GitHub Actions automation

### git-commit

Execute git commit with conventional commit message analysis, intelligent staging, and message generation.

**Triggers:** "commit changes", "create a git commit", "/commit"  
**Use For:** Auto-detecting commit type/scope, generating conventional commits, intelligent staging

### microsoft-docs

Query official Microsoft documentation to understand Azure, .NET, Microsoft 365, Windows, and Power Platform concepts, tutorials, and best practices.

**Triggers:** Asking about Azure, .NET, Microsoft services concepts  
**Use For:** Azure Functions patterns, Document Intelligence APIs, SQL best practices, Pulumi reference

### microsoft-code-reference

Look up Microsoft API references, find working code samples, and verify Azure SDKs and .NET library code is correct. Catches hallucinated methods, wrong signatures, and deprecated patterns.

**Triggers:** Working with Azure SDKs, .NET libraries, Microsoft APIs  
**Use For:** Validating `@azure/*` package methods, checking API signatures, finding working examples

### appinsights-instrumentation

Instrument webapps to send useful telemetry data to Azure App Insights. Includes platform-specific guides for Node.js, ASP.NET Core, Python, and auto-instrumentation.

**Triggers:** Instrumenting apps, adding telemetry, working with App Insights  
**Use For:** Custom telemetry in Azure Functions, structured logging, performance monitoring, distributed tracing

**Bundled Assets:**

- `examples/appinsights.bicep` - Bicep deployment template
- `references/NODEJS.md` - Node.js instrumentation patterns
- `references/ASPNETCORE.md` - ASP.NET Core patterns
- `references/AUTO.md` - Auto-instrumentation
- `references/PYTHON.md` - Python patterns
- `scripts/appinsights.ps1` - PowerShell helper

## How Skills Work

Skills are **automatically discovered and loaded when relevant**. Unlike prompts (manual invocation) or agents (chat modes), you don't need to explicitly call them.

### Activation Examples

**GitHub Operations:**

```
"Create a GitHub issue for the new database migration task"
→ gh-cli skill automatically loads
```

**Committing Code:**

```
"Commit these changes"
→ git-commit skill analyzes diff, suggests conventional commit message
```

**Azure Documentation:**

```
"How do I configure Azure Functions to use Application Insights?"
→ microsoft-docs skill queries official docs for current instructions
```

**SDK Validation:**

```
"Use Azure Storage SDK to upload a blob"
→ microsoft-code-reference skill validates method signatures, prevents hallucination
```

**Telemetry Instrumentation:**

```
"Add custom telemetry to track document processing duration"
→ appinsights-instrumentation skill references Node.js patterns
```

## Quick Reference

| Need                               | Skill                       | Activation                                             |
| ---------------------------------- | --------------------------- | ------------------------------------------------------ |
| GitHub issue/PR management         | gh-cli                      | Mention "create issue", "list PRs", "merge"            |
| Commit with message generation     | git-commit                  | Say "commit changes" or "/commit"                      |
| Azure/Microsoft documentation      | microsoft-docs              | Ask about Azure services, .NET, Microsoft tech         |
| Validate Azure SDK code            | microsoft-code-reference    | Write code using `@azure/*` packages                   |
| Add Application Insights telemetry | appinsights-instrumentation | Mention "telemetry", "instrumentation", "App Insights" |

## Configuration

> [!TIP]
> To ensure GitHub Copilot discovers your skills, add to `.vscode/settings.json`:
>
> ```json
> {
>   "github.copilot.advanced": {
>     "skillsDirectories": [".github/skills"]
>   }
> }
> ```

## Skill vs. Other Primitives

**Use Skills When:**

- Complex workflows requiring bundled resources (scripts, templates, reference data)
- CLI tool integration and automation
- Specialized tasks with supporting documentation
- Workflows needing code samples or helper utilities

**Use Other Primitives When:**

- Simple prompt-based tasks → Use prompts
- File-pattern-based coding standards → Use instructions
- Chat-mode expertise → Use agents
- Grouped workflows → Use collections

Skills are loaded on-demand and support progressive disclosure, making them ideal for specialized, resource-intensive capabilities.
