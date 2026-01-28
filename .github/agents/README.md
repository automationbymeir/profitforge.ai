# Agents

Custom agents (chat modes) for GitHub Copilot, providing specialized expertise through extended conversations. Agents act as domain experts that you can switch to during chat sessions.

## Installed Agents

### Planning & Architecture

**@implementation-plan**  
Generate an implementation plan for new features or refactoring existing code.

**@plan**  
Strategic planning and architecture assistant focused on thoughtful analysis before implementation. Helps understand codebases, clarify requirements, and develop comprehensive implementation strategies.

**@planner**  
Generate an implementation plan for new features or refactoring existing code. General planning assistance.

**@prd**  
Generate a comprehensive Product Requirements Document (PRD) in Markdown, detailing user stories, acceptance criteria, technical considerations, and metrics. Optionally creates GitHub issues upon user confirmation.

**@task-planner**  
Task planner for creating actionable implementation plans. Brought to you by microsoft/edge-ai. Creates structured plans with phases, tasks, and dependencies.

**@task-researcher**  
Task research specialist for comprehensive project analysis. Brought to you by microsoft/edge-ai. Analyzes codebase, dependencies, and patterns to inform planning.

### Technical Spikes & Research

**@research-technical-spike**  
Systematically research and validate technical spike documents through exhaustive investigation and controlled experimentation.

### Azure Expertise

**@azure-principal-architect**  
Azure Principal Architect expert mode for cloud architecture, best practices, and strategic Azure decisions.

### Testing & Quality

**@tdd-red**  
Test-Driven Development: Write failing tests first (Red phase of Red-Green-Refactor).

**@tdd-refactor**  
Test-Driven Development: Refactor code while maintaining passing tests (Refactor phase of Red-Green-Refactor).

## How to Use Agents

Switch to an agent during a chat session by mentioning it with the `@` symbol:

```
@task-planner
I need to implement authentication for the Azure Functions API
```

The agent will respond with its specialized expertise and maintain context throughout the conversation.

### Workflow Examples

**Epic → Feature → Implementation:**

```
@prd
Create a PRD for user authentication system

(After PRD is created)
@plan
Review the PRD and suggest an architecture

(After architecture review)
@implementation-plan
Create an implementation plan for the authentication system
```

**Research → Plan → Implement:**

```
@task-researcher
Analyze the current codebase for authentication patterns

(After research)
@task-planner
Create a task plan for implementing OAuth2 authentication

(Implementation follows with task-implementation instructions)
```

**Technical Investigation:**

```
@research-technical-spike
Research options for distributed tracing in Azure Functions

(After research)
@azure-principal-architect
What's the best approach for distributed tracing in our architecture?
```

**Test-Driven Development:**

```
@tdd-red
Write tests for the new document processing endpoint

(After tests)
// Implement the code to pass tests

@tdd-refactor
The tests pass, now help refactor for better maintainability
```

## Agent vs. Other Primitives

**Use Agents When:**

- Extended conversation needed
- Domain expertise required (Azure, planning, testing)
- Strategic thinking and analysis
- Iterative refinement of ideas

**Use Other Primitives When:**

- One-time task → Use prompts
- Automatic file-pattern rules → Use instructions
- CLI tool integration → Use skills
- Grouped workflows → Use collections

## Integration with Project Workflow

> [!NOTE]
> Agents work seamlessly with your prompts and instructions:
>
> **Planning Phase:**
>
> - `@task-researcher` - Analyze project
> - `@task-planner` - Create structured plan
> - Or use `/create-implementation-plan` prompt
>
> **Design Phase:**
>
> - `@azure-principal-architect` - Azure guidance
> - `@plan` - Strategic architecture decisions
> - Followed by `/create-specification` prompt
>
> **Implementation Phase:**
>
> - `@tdd-red` → `@tdd-refactor` - Test-driven development
> - Azure Functions TypeScript instructions auto-apply
> - Task implementation instructions track progress
>
> **Documentation Phase:**
>
> - `@prd` - Create comprehensive PRDs
> - Followed by `/create-readme` prompt

## Microsoft Edge AI Agents

The `@task-planner` and `@task-researcher` agents are part of the microsoft/edge-ai toolkit, providing advanced task breakdown and research capabilities:

**@task-researcher:**

- Comprehensive codebase analysis
- Dependency mapping
- Pattern identification
- Research documentation generation

**@task-planner:**

- Phase-based implementation plans
- Task dependencies and ordering
- Success criteria definition
- Integration with task-implementation instructions

These agents create files in `.copilot-tracking/` directory for structured planning and tracking.

## Quick Reference

| Need                 | Agent                      | Use Case                                 |
| -------------------- | -------------------------- | ---------------------------------------- |
| Product requirements | @prd                       | Create PRDs with user stories            |
| Strategic planning   | @plan                      | Architecture and implementation strategy |
| Implementation plans | @implementation-plan       | Feature development planning             |
| Task breakdown       | @task-planner              | Detailed phase-based plans               |
| Codebase analysis    | @task-researcher           | Research existing patterns               |
| Technical research   | @research-technical-spike  | Validate technical decisions             |
| Azure architecture   | @azure-principal-architect | Cloud infrastructure guidance            |
| Write failing tests  | @tdd-red                   | Test-driven development (Red)            |
| Refactor with tests  | @tdd-refactor              | Test-driven development (Refactor)       |
| General planning     | @planner                   | Quick planning assistance                |

## Model Configuration

Some agents specify preferred models in their configuration:

- Strategic planning agents may use Claude Sonnet 4 for deeper reasoning
- Task-focused agents may use GPT-4o for structured output
- Default model is used when not specified

You can override model selection in VS Code settings or during the chat session.
