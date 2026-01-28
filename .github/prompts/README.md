# Prompts

Reusable prompt templates for specific development scenarios and tasks. Prompts define structured workflows with a specific mode, model, and available set of tools.

## Installed Prompts

### Planning & Project Management

**create-implementation-plan.prompt.md**  
Create a new implementation plan file for new features, refactoring existing code, or upgrading packages, design, architecture, or infrastructure.

**create-specification.prompt.md**  
Create a new specification file for the solution, optimized for Generative AI consumption.

**create-architectural-decision-record.prompt.md**  
Create an Architectural Decision Record (ADR) document for AI-optimized decision documentation.

**create-technical-spike.prompt.md**  
Create time-boxed technical spike documents for researching and resolving critical development decisions before implementation.

**update-implementation-plan.prompt.md**  
Update an existing implementation plan file with new or updated requirements.

**breakdown-epic-arch.prompt.md**  
Create the high-level technical architecture for an Epic, based on a Product Requirements Document.

**breakdown-epic-pm.prompt.md**  
Create an Epic Product Requirements Document (PRD) for a new epic. Used as input for generating technical architecture specifications.

**breakdown-feature-implementation.prompt.md**  
Create detailed feature implementation plans, following monorepo structure.

**breakdown-feature-prd.prompt.md**  
Create Product Requirements Documents (PRDs) for new features, based on an Epic.

**create-github-issues-feature-from-implementation-plan.prompt.md**  
Create GitHub Issues from implementation plan phases using feature_request.yml or chore_request.yml templates.

### Documentation

**create-readme.prompt.md**  
Create a README.md file for the project.

**conventional-commit.prompt.md**  
Generate conventional commit messages using a structured XML format with the Conventional Commits specification.

### AI & Safety

**ai-prompt-engineering-safety-review.prompt.md**  
Safety review for AI prompt engineering.

### Meta Prompts

**suggest-awesome-github-copilot-prompts.prompt.md**  
Suggest relevant GitHub Copilot prompt files from the awesome-copilot repository based on current repository context, avoiding duplicates and identifying outdated prompts.

**suggest-awesome-github-copilot-collections.prompt.md**  
Suggest relevant GitHub Copilot collections from the awesome-copilot repository, providing automatic download and installation of collection assets.

**suggest-awesome-github-copilot-skills.prompt.md**  
Suggest relevant GitHub Copilot Agent Skills from the awesome-copilot repository, providing automatic download and installation of skills with bundled assets.

## How to Use Prompts

After VS Code indexes the prompt files, you can run them directly using the `/` command:

```
/create-implementation-plan
/create-specification
/breakdown-epic-arch
/conventional-commit
```

Or use the VS Code command palette:

- `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Search for "Chat: Run Prompt"
- Select the desired prompt

## Recommended Workflows

### Epic → Feature → Implementation (Agile)

1. `/breakdown-epic-pm` - Create Epic PRD
2. `/breakdown-epic-arch` - Define architecture
3. `/breakdown-feature-prd` - Break into features
4. `/breakdown-feature-implementation` - Create implementation plans
5. `/create-github-issues-feature-from-implementation-plan` - Track in GitHub

### Technical Investigation

1. `/create-technical-spike` - Define research goals
2. (Use `@research-technical-spike` agent) - Conduct investigation
3. (Use `@plan` agent) - Develop strategic implementation approach

### Documentation & Standards

1. `/create-readme` - Generate project README
2. `/create-specification` - Define requirements and interfaces
3. `/create-architectural-decision-record` - Document key decisions
4. `/conventional-commit` - Generate standardized commit messages

## Integration with Other Primitives

> [!NOTE]
> Prompts work alongside agents (chat modes) and instructions (automatic file-pattern rules):
>
> - **Prompts** - Manual invocation for specific tasks
> - **Agents** - Chat modes for extended conversations
> - **Instructions** - Automatic application based on file patterns
> - **Skills** - On-demand loading for specialized workflows

## Meta Prompts for Discovery

Use the suggestion prompts to discover additional resources from awesome-copilot:

- `/suggest-awesome-github-copilot-prompts` - Find new prompts
- `/suggest-awesome-github-copilot-collections` - Discover grouped workflows
- `/suggest-awesome-github-copilot-skills` - Get specialized capabilities

These prompts analyze your repository context and suggest relevant additions.
