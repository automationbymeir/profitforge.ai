# Instructions

Coding standards and best practices that apply automatically to specific file patterns. Instructions enhance GitHub Copilot's understanding of project-specific conventions and requirements.

## Installed Instructions

### azure-functions-typescript.instructions.md

TypeScript patterns and best practices for Azure Functions development.

**Applies To:** `**/*.ts`, `**/*.js`, `**/*.json`  
**Purpose:** Ensures Azure Functions code follows Node.js 20 runtime patterns, proper HTTP trigger handling, queue processing, and TypeScript best practices.

**Key Patterns:**

- Azure Functions v4 programming model
- Async/await patterns for all functions
- Proper error handling and logging
- Type-safe function definitions
- Queue trigger patterns
- HTTP request/response handling

### spec-driven-workflow-v1.instructions.md

Specification-Driven Workflow provides a structured approach to software development, ensuring that requirements are clearly defined, designs are meticulously planned, and implementations are thoroughly documented and validated.

**Applies To:** `**` (all files)  
**Purpose:** Guides the 6-phase development workflow: Analyze → Design → Implement → Validate → Reflect → Handoff.

**Key Principles:**

- Requirements in EARS notation (Easy Approach to Requirements Syntax)
- Design before implementation
- Comprehensive validation and testing
- Documentation at every phase
- Technical debt tracking
- Quality assurance automation

**6-Phase Workflow:**

1. **Analyze** - Understand problem, define requirements
2. **Design** - Create technical design, implementation plan
3. **Implement** - Write production-quality code
4. **Validate** - Verify against requirements, run tests
5. **Reflect** - Refactor, update docs, identify improvements
6. **Handoff** - Package for review, deployment

### task-implementation.instructions.md

Instructions for implementing task plans with progressive tracking and change record. Brought to you by microsoft/edge-ai.

**Applies To:** `**/.copilot-tracking/changes/*.md`  
**Purpose:** Guides structured implementation of task plans created by the `@task-planner` agent.

**Key Features:**

- Progressive phase-by-phase implementation
- Change tracking in `.copilot-tracking/` directory
- Quality gates and verification
- Roll-forward recovery (never rollback)
- Integration with task planner workflow

## How Instructions Work

Instructions are **automatically applied based on file patterns**. When you open or edit a file that matches an instruction's `applyTo` pattern, GitHub Copilot incorporates those guidelines into its suggestions.

### Automatic Application

**Editing a TypeScript file in Azure Functions:**

```typescript
// When you start writing an Azure Function
export async function myFunction(request: HttpRequest): Promise<HttpResponseInit>;
// ↑ azure-functions-typescript.instructions.md is automatically active
// Copilot suggests proper patterns, error handling, and TypeScript types
```

**Working on implementation:**

```
// When following spec-driven-workflow-v1.instructions.md
// You're guided through: requirements → design → implementation → validation
// Copilot prompts for proper documentation and testing at each phase
```

**Implementing task plans:**

```
// When editing files in .copilot-tracking/changes/
// task-implementation.instructions.md guides progressive implementation
// Copilot tracks changes and ensures quality gates are met
```

## Integration with Development Workflow

> [!TIP]
> Instructions work seamlessly with your agents and prompts:
>
> **Planning Phase:**
>
> - Use `@task-planner` or `/create-implementation-plan`
> - spec-driven-workflow-v1 guides the planning process
>
> **Implementation Phase:**
>
> - Edit TypeScript/JavaScript files
> - azure-functions-typescript guides Azure Functions patterns
> - task-implementation tracks progress if using task plans
>
> **Validation Phase:**
>
> - spec-driven-workflow-v1 ensures comprehensive testing
> - All instructions emphasize quality and documentation

## File Pattern Coverage

| Pattern                             | Instruction                | Purpose                           |
| ----------------------------------- | -------------------------- | --------------------------------- |
| `**/*.ts`, `**/*.js`, `**/*.json`   | azure-functions-typescript | Azure Functions best practices    |
| `**` (all files)                    | spec-driven-workflow-v1    | Structured development workflow   |
| `**/.copilot-tracking/changes/*.md` | task-implementation        | Task plan implementation tracking |

## Benefits

**Consistency:**  
All team members and AI assistance follow the same standards automatically.

**Context-Aware:**  
Guidance appears exactly when needed, based on file type and location.

**No Manual Invocation:**  
Unlike prompts, instructions apply automatically without user action.

**Project-Specific:**  
Tailored to your Azure Functions + TypeScript + Pulumi stack.

## Adding New Instructions

To add custom instructions:

1. Create a new `.instructions.md` file in this directory
2. Add YAML front matter with `description` and `applyTo` fields:
   ```yaml
   ---
   description: 'Your instruction description'
   applyTo: '**/*.ts, **/*.js'
   ---
   ```
3. Write your guidelines in the markdown body
4. GitHub Copilot will automatically discover and apply them

> [!NOTE]
> Instructions complement but don't replace code reviews, linters, or automated testing. They guide AI assistance but don't enforce rules at build time.
