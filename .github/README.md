# GitHub Copilot Configuration

AI-assisted development infrastructure for the ProfitForge project. This directory contains agents, instructions, prompts, and skills that enhance GitHub Copilot's capabilities for Azure Functions development with TypeScript.

## Directory Structure

```
.github/
├── agents/         # Chat mode specialists (extended conversations)
├── instructions/   # Auto-applied coding standards (file pattern rules)
├── prompts/        # Manual task templates (one-time invocations)
└── skills/         # On-demand capabilities with bundled resources
```

## Quick Reference

| Primitive    | Invocation        | When to Use                                      | Examples                        |
| ------------ | ----------------- | ------------------------------------------------ | ------------------------------- |
| **Agent**    | `@agent-name`     | Extended conversations, domain expertise         | `@plan`, `@tdd-red`             |
| **Prompt**   | `/prompt-name`    | One-time structured tasks                        | `/conventional-commit`          |
| **Instruction** | Automatic      | File-pattern-based coding standards              | TypeScript files → Azure rules  |
| **Skill**    | Automatic/mention | CLI integration, specialized workflows           | "commit changes" → git skill    |

---

## Agents (`agents/`)

**Purpose:** Domain expert chat modes for extended conversations and strategic thinking.

**How They Work:** Switch to an agent during a GitHub Copilot chat session by mentioning it with `@`:

```
@plan
How should I architect the new authentication system?
```

### Installed Agents

#### Planning & Product

- **@prd** - Create Product Requirements Documents with user stories and acceptance criteria
- **@plan** - Strategic planning and architecture analysis before implementation
- **@implementation-plan** - Generate structured implementation plans for features or refactoring
- **@task-planner** - Phase-based task breakdown with dependencies (microsoft/edge-ai)
- **@task-researcher** - Comprehensive codebase analysis and pattern identification (microsoft/edge-ai)

#### Technical & Architecture

- **@azure-principal-architect** - Cloud architecture, Azure best practices, infrastructure decisions
- **@research-technical-spike** - Time-boxed technical research and validation

#### Testing & Quality

- **@tdd-red** - Write failing tests first (Red phase of TDD)
- **@tdd-refactor** - Refactor code while maintaining passing tests (Refactor phase of TDD)

### When to Use Agents

✅ **Use agents for:**
- Strategic architecture decisions
- Iterative problem-solving through conversation
- Domain-specific expertise (Azure, testing, planning)
- Analyzing complex codebases
- Creating comprehensive documentation (PRDs, specs)

❌ **Don't use agents for:**
- One-time commands or tasks → Use prompts
- Automatic file-based rules → Use instructions
- CLI tool execution → Use skills

---

## Instructions (`instructions/`)

**Purpose:** Automatically applied coding standards based on file patterns. Instructions enhance GitHub Copilot's understanding of project-specific conventions.

**How They Work:** When you open or edit a file matching an instruction's `applyTo` pattern, GitHub Copilot automatically incorporates those guidelines into its suggestions.

### Installed Instructions

#### azure-functions-typescript.instructions.md
**Applies To:** `**/*.ts`, `**/*.js`, `**/*.json`  
**Purpose:** Azure Functions v4 patterns, async/await, HTTP/queue triggers, TypeScript best practices

**Auto-activates when:**
- Editing TypeScript/JavaScript files in the project
- Creating new Azure Function handlers
- Working with HTTP requests, queue messages, blob triggers

#### spec-driven-workflow-v1.instructions.md
**Applies To:** `**` (all files)  
**Purpose:** 6-phase development workflow: Analyze → Design → Implement → Validate → Reflect → Handoff

**Guides you through:**
1. **Analyze** - Requirements in EARS notation, confidence scoring
2. **Design** - Technical architecture, implementation planning
3. **Implement** - Production-quality code in increments
4. **Validate** - Automated tests, edge cases, quality gates
5. **Reflect** - Refactoring, documentation updates, technical debt
6. **Handoff** - Executive summary, changelog, artifacts

#### task-implementation.instructions.md
**Applies To:** `**/.copilot-tracking/changes/*.md`  
**Purpose:** Progressive task plan implementation with change tracking (microsoft/edge-ai)

**Features:**
- Phase-by-phase implementation tracking
- Quality gates and verification
- Roll-forward recovery (no rollbacks)
- Integration with `@task-planner` agent

### When to Use Instructions

✅ **Automatic application** - No invocation needed:
- Instructions activate based on file patterns
- Coding standards applied consistently across team
- Context-aware guidance appears when relevant

---

## Prompts (`prompts/`)

**Purpose:** Reusable templates for specific one-time tasks with structured workflows.

**How to Use:** Invoke prompts using `/` command in GitHub Copilot chat:

```
/create-implementation-plan
/conventional-commit
/create-specification
```

Or via Command Palette:
- `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Search: "Chat: Run Prompt"

### Installed Prompts

#### Planning & Project Management
- `/create-implementation-plan` - Implementation plans for features or refactoring
- `/create-specification` - Specification documents optimized for AI consumption
- `/create-architectural-decision-record` - ADR documentation for key decisions
- `/create-technical-spike` - Time-boxed research spike documents
- `/update-implementation-plan` - Update existing plans with new requirements
- `/breakdown-epic-arch` - High-level technical architecture from Epic PRD
- `/breakdown-epic-pm` - Epic Product Requirements Documents
- `/breakdown-feature-implementation` - Detailed feature implementation plans
- `/breakdown-feature-prd` - Feature PRDs from Epics
- `/create-github-issues-feature-from-implementation-plan` - Generate GitHub issues from plans

#### Documentation
- `/create-readme` - Project README generation
- `/create-documentation` - Consolidate and improve documentation
- `/conventional-commit` - Generate conventional commit messages

#### Workflow Enhancement
- `/create-github-action-workflow-specification` - CI/CD workflow specifications
- `/gen-specs-as-issues` - Convert specifications to GitHub issues
- `/project-workflow-analysis-blueprint-generator` - Analyze and document workflows

#### Meta/Discovery
- `/suggest-awesome-github-copilot-prompts` - Discover new prompts from awesome-copilot
- `/suggest-awesome-github-copilot-instructions` - Find relevant instructions
- `/suggest-awesome-github-copilot-skills` - Suggest specialized skills

### When to Use Prompts

✅ **Use prompts for:**
- One-time structured tasks
- Document generation (specs, PRDs, ADRs)
- Standard workflows (commit messages, issue creation)
- Repeatable processes with consistent format

❌ **Don't use prompts for:**
- Extended conversations → Use agents
- Automatic file rules → Use instructions
- CLI tool execution → Use skills

---

## Skills (`skills/`)

**Purpose:** Self-contained capabilities with bundled resources (scripts, templates, references) that load on-demand.

**How They Work:** Skills automatically activate when relevant context is detected. No manual invocation needed (though you can mention keywords to trigger them).

### Installed Skills

#### gh-cli
**Auto-activates:** Mentioning GitHub operations (issues, PRs, repositories, Actions)  
**Purpose:** GitHub CLI reference for repository management, issue tracking, PR workflows

**Use for:**
- Creating/managing GitHub issues
- PR operations (create, merge, review)
- Repository administration
- GitHub Actions workflow management

**Example:** "Create a GitHub issue for the database migration task"

#### git-commit
**Auto-activates:** Mentioning "commit changes", "create a commit", or `/commit`  
**Purpose:** Intelligent commit message generation with conventional commits

**Features:**
- Auto-detects commit type and scope
- Analyzes git diff for context
- Generates conventional commit messages
- Intelligent staging suggestions

**Example:** "Commit these changes"

#### microsoft-docs
**Auto-activates:** Asking about Azure, .NET, Microsoft services  
**Purpose:** Query official Microsoft documentation for current best practices

**Use for:**
- Azure Functions patterns
- Document Intelligence API reference
- SQL Database best practices
- Pulumi Azure Native provider

**Example:** "How do I configure Application Insights in Azure Functions?"

#### microsoft-code-reference
**Auto-activates:** Working with Azure SDKs, .NET libraries, Microsoft APIs  
**Purpose:** Validate API signatures and find working code samples

**Prevents:**
- Hallucinated methods
- Wrong function signatures
- Deprecated API patterns

**Example:** "Use Azure Blob Storage SDK to upload a file"

#### appinsights-instrumentation
**Auto-activates:** Mentioning "telemetry", "instrumentation", "App Insights"  
**Purpose:** Add structured telemetry to applications

**Bundled resources:**
- `examples/appinsights.bicep` - Infrastructure template
- `references/NODEJS.md` - Node.js patterns
- `references/ASPNETCORE.md` - .NET Core patterns
- `references/AUTO.md` - Auto-instrumentation
- `scripts/appinsights.ps1` - Helper scripts

**Example:** "Add custom metrics for document processing duration"

#### refactor
**Auto-activates:** Mentioning "refactor", code quality improvements  
**Purpose:** Systematic refactoring workflows and patterns

**Example:** "Refactor this function to improve maintainability"

### When to Use Skills

✅ **Use skills for:**
- CLI tool integration (GitHub CLI, git)
- Specialized workflows with supporting files
- Documentation lookup (Microsoft docs, API reference)
- Tasks requiring templates/scripts

❌ **Skills activate automatically** - typically no manual invocation needed

---

## End-to-End Workflow Patterns

### Pattern 1: Feature Development (Complete Lifecycle)

**Objective:** Implement a new feature from idea to production

```
1. IDEATION & PLANNING
   @prd
   → Create a PRD for [feature name] with user stories and acceptance criteria
   
   @plan
   → Review this PRD and suggest technical architecture
   
   /create-implementation-plan
   → Generate implementation plan based on the architecture

2. TASK BREAKDOWN
   @task-researcher
   → Analyze the codebase for related patterns and dependencies
   
   @task-planner
   → Create a phase-based task plan for implementing [feature]

3. IMPLEMENTATION
   # Instructions auto-apply based on file types:
   # - spec-driven-workflow-v1 guides the process
   # - azure-functions-typescript enforces patterns
   # - task-implementation tracks progress (if using task-planner)
   
   @tdd-red
   → Write failing tests for [component]
   
   # Implement code to pass tests
   
   @tdd-refactor
   → Refactor for maintainability while keeping tests green

4. DOCUMENTATION
   /create-documentation
   → Update docs to reflect new feature
   
   /create-readme
   → Update README with new capabilities

5. COMMIT & TRACK
   /conventional-commit
   → Generate conventional commit message
   
   /create-github-issues-feature-from-implementation-plan
   → Create GitHub issues for tracking (optional)
```

**Estimated Time:** 1-2 days for medium-sized feature

---

### Pattern 2: Refactoring & Code Quality

**Objective:** Improve existing codebase structure and maintainability

```
1. ANALYSIS
   @task-researcher
   → Analyze [module/component] for refactoring opportunities
   
   @plan
   → What's the best approach to refactor this code?

2. PLANNING
   /create-implementation-plan
   → Create refactoring plan with phases and rollback strategy
   
   /create-architectural-decision-record
   → Document key architectural decisions

3. TEST COVERAGE
   @tdd-red
   → Write tests for existing behavior before refactoring
   
   # Ensure all tests pass

4. REFACTOR
   @tdd-refactor
   → Refactor [component] while maintaining test coverage
   
   # Instructions auto-apply:
   # - spec-driven-workflow-v1 guides validation
   # - azure-functions-typescript ensures patterns

5. VALIDATION
   # Run full test suite
   npm test
   npm run test:integration
   
   /create-documentation
   → Update architecture docs with refactoring changes

6. COMMIT
   /conventional-commit
   → Generate commit message for refactoring
```

**Estimated Time:** Half-day to 2 days depending on scope

---

### Pattern 3: Technical Spike & Research

**Objective:** Investigate technical options before making architectural decisions

```
1. DEFINE SPIKE
   /create-technical-spike
   → Create spike document for [technology/approach]
   
   # Define:
   # - Research question
   # - Success criteria
   # - Time box (typically 2-4 hours)

2. RESEARCH
   @research-technical-spike
   → Research [technology] options and trade-offs
   
   # Skills auto-activate:
   # - microsoft-docs for Azure/Microsoft tech
   # - microsoft-code-reference for API validation

3. PROTOTYPING
   # Build proof-of-concept
   # Test critical assumptions
   # Document findings in spike document

4. DECISION
   @azure-principal-architect
   → Based on spike findings, what's the recommended approach?
   
   /create-architectural-decision-record
   → Document the decision with rationale and trade-offs

5. PLANNING
   /create-implementation-plan
   → Create implementation plan based on spike results
```

**Estimated Time:** Half-day (time-boxed spike)

---

### Pattern 4: Bug Investigation & Fix

**Objective:** Diagnose and fix production issues

```
1. INVESTIGATION
   @plan
   → Analyze this error/bug: [error message or description]
   
   @task-researcher
   → Find related code patterns and potential root causes

2. REPRODUCTION
   @tdd-red
   → Write a failing test that reproduces the bug
   
   # Verify test fails as expected

3. FIX
   # Implement fix
   # Instructions auto-apply: azure-functions-typescript patterns
   
   @tdd-refactor
   → Improve error handling to prevent similar bugs

4. VALIDATION
   # Ensure fix passes tests
   # Run full test suite
   # Test edge cases

5. DOCUMENTATION
   /create-documentation
   → Update docs if behavior changed or clarification needed
   
   /conventional-commit
   → Generate commit message (fix: ...)
```

**Estimated Time:** 2 hours to 1 day

---

### Pattern 5: CI/CD Pipeline Setup

**Objective:** Create or improve GitHub Actions workflows

```
1. PLANNING
   @github-actions-expert
   → What's the best CI/CD strategy for [deployment scenario]?
   
   /create-github-action-workflow-specification
   → Create workflow specification document

2. IMPLEMENTATION
   # Instructions auto-apply:
   # - github-actions-ci-cd-best-practices
   
   @plan
   → Review this workflow configuration for issues

3. TESTING
   # Test workflows in feature branch
   # Validate with @github-actions-expert if issues arise

4. DOCUMENTATION
   /create-documentation
   → Update deployment.md with CI/CD instructions
   
   /conventional-commit
   → Generate commit (ci: ...)
```

**Estimated Time:** Half-day

---

### Pattern 6: Documentation Consolidation

**Objective:** Improve and organize project documentation

```
1. AUDIT
   /create-documentation
   → Analyze existing docs and suggest improvements

2. CONSOLIDATION
   # Follow suggestions from prompt
   # Merge redundant files
   # Update outdated content
   # Fill documentation gaps

3. REVIEW
   @plan
   → Review documentation structure for completeness
   
   # Check for:
   # - Missing project-specific knowledge
   # - Outdated examples
   # - Redundant content

4. FINALIZE
   /conventional-commit
   → Generate commit (docs: ...)
```

**Estimated Time:** 2-4 hours

---

## Configuration

### VS Code Settings

Ensure GitHub Copilot discovers your configuration:

```json
{
  "github.copilot.advanced": {
    "agentsDirectory": ".github/agents",
    "instructionsDirectory": ".github/instructions", 
    "promptsDirectory": ".github/prompts",
    "skillsDirectories": [".github/skills"]
  }
}
```

### Environment Setup

No additional environment setup required. GitHub Copilot automatically discovers:
- Agents from `.agent.md` files
- Instructions from `.instructions.md` files
- Prompts from `.prompt.md` files
- Skills from `SKILL.md` files in subdirectories

---

## Best Practices

### Combining Primitives

✅ **Effective combinations:**
- Agent conversation → Prompt for structured output
- Research spike (agent) → ADR (prompt) → Implementation (instructions)
- Task planner (agent) → Task implementation (instructions)
- Strategic planning (agent) → Conventional commit (prompt)

❌ **Avoid:**
- Using multiple agents simultaneously (choose one per conversation)
- Invoking prompts mid-agent-conversation (finish conversation first)
- Manually replicating what instructions do automatically

### Workflow Selection

**Choose based on goal:**
- **New feature?** → Pattern 1 (Feature Development)
- **Code quality improvement?** → Pattern 2 (Refactoring)
- **Uncertain technical approach?** → Pattern 3 (Technical Spike)
- **Bug or issue?** → Pattern 4 (Bug Fix)
- **Infrastructure change?** → Pattern 5 (CI/CD Setup)
- **Documentation cleanup?** → Pattern 6 (Documentation)

### Iterative Development

GitHub Copilot works best with iterative approaches:
1. Start with planning (agent or prompt)
2. Implement in small increments (instructions guide automatically)
3. Validate frequently (TDD agents)
4. Refine based on feedback
5. Document as you go (prompts for structured docs)

---

## Troubleshooting

### Agent not responding with expertise

**Check:**
- Agent file has correct `.agent.md` extension
- YAML front matter includes `description` field
- VS Code settings point to `.github/agents` directory

**Solution:** Restart VS Code, verify file structure

### Instructions not applying automatically

**Check:**
- File extension is `.instructions.md`
- `applyTo` pattern in YAML front matter matches your file
- VS Code settings include `instructionsDirectory`

**Example applyTo patterns:**
- `**/*.ts` - All TypeScript files
- `**` - All files
- `src/**/*.ts` - TypeScript in src/ only

### Prompt not showing in `/` menu

**Check:**
- File extension is `.prompt.md`
- YAML front matter includes required fields
- VS Code has indexed the prompts directory

**Solution:** Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")

### Skill not activating

**Check:**
- Skill folder contains `SKILL.md` file
- VS Code settings include skill directory in `skillsDirectories` array
- Mentioned relevant trigger keywords in chat

**Solution:** Explicitly mention skill trigger words (see skill descriptions above)

---

## Contributing

### Adding New Primitives

#### New Agent
1. Create `.github/agents/new-agent.agent.md`
2. Add YAML front matter with description and instructions
3. Test with `@new-agent` in chat

#### New Instruction
1. Create `.github/instructions/new-instruction.instructions.md`
2. Add `applyTo` file pattern in YAML
3. Test by editing matching files

#### New Prompt
1. Create `.github/prompts/new-prompt.prompt.md`
2. Add YAML front matter with description
3. Test with `/new-prompt`

#### New Skill
1. Create `.github/skills/new-skill/` directory
2. Add `SKILL.md` with instructions
3. Optionally add `examples/`, `references/`, `scripts/`
4. Test with trigger keywords

### Documentation

Update this README when:
- Adding new agents, instructions, prompts, or skills
- Discovering effective workflow patterns
- Identifying common troubleshooting issues
- Improving configuration or setup process

---

## Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Awesome GitHub Copilot](https://github.com/jmatthiesen/awesome-copilot) - Community resources
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message standard
- [EARS Notation](https://alistairmavin.com/ears/) - Requirements syntax

---

## Quick Start Checklist

- [ ] VS Code configured with GitHub Copilot extension
- [ ] `.vscode/settings.json` includes Copilot directories
- [ ] Familiarized with installed agents (`@plan`, `@tdd-red`, etc.)
- [ ] Tested prompt invocation (`/conventional-commit`)
- [ ] Verified instructions auto-apply (edit TypeScript file)
- [ ] Tested skill activation ("commit these changes")
- [ ] Selected workflow pattern for current task
- [ ] Read relevant agent/prompt/instruction/skill README files

**Ready to enhance your development workflow with AI assistance!**
