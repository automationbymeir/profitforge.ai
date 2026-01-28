---
agent: 'agent'
description: 'Suggest relevant GitHub Copilot Agent Skills from the awesome-copilot repository based on current repository context and chat history, providing automatic download and installation of skills, and identifying outdated skills that need updates.'
tools:
  [
    'edit/editFiles',
    'edit/createFile',
    'search/codebase',
    'read/readFile',
    'execute/runInTerminal',
    'execute/getTerminalOutput',
    'read/terminalLastCommand',
    'read/terminalSelection',
    'execute/createAndRunTask',
    'execute/runTask',
    'read/getTaskOutput',
    'search/changes',
    'execute/testFailure',
    'vscode/openSimpleBrowser',
    'web/fetch',
    'web/githubRepo',
    'todo',
  ]
---

# Suggest Awesome GitHub Copilot Agent Skills

Analyze current repository context and suggest relevant Agent Skills from the [GitHub awesome-copilot repository](https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md) that would enhance the development workflow for this repository.

## Process

1. **Fetch Available Skills**: Extract skill list and descriptions from [awesome-copilot README.skills.md](https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md). Must use `#fetch` tool.
2. **Scan Local Skills**: Discover existing skill folders in `.github/skills/` directory
3. **Extract Local Descriptions**: Read `SKILL.md` files from local skill folders to understand existing capabilities
4. **Fetch Remote Versions**: For each local skill that matches an awesome-copilot skill, fetch the corresponding `SKILL.md` from awesome-copilot repository using raw GitHub URLs (e.g., `https://raw.githubusercontent.com/github/awesome-copilot/main/skills/<skill-name>/SKILL.md`)
5. **Compare Versions**: Compare local skill content with remote versions to identify:
   - Skills that are up-to-date (exact match)
   - Skills that are outdated (content differs)
   - Key differences in outdated skills (description, instructions, bundled assets)
6. **Analyze Repository Context**: Review chat history, repository files, programming languages, frameworks, tools, and current project needs
7. **Match Skill Relevance**: Compare available skills against identified patterns, tools, and requirements
8. **Check Skill Overlap**: For relevant skills, analyze capabilities to avoid duplicates with existing repository skills
9. **Present Skill Options**: Display relevant skills with descriptions, bundled assets, outdated skill counts, and rationale for suggestion
10. **Provide Usage Guidance**: Explain how the installed skill enhances the development workflow
    **AWAIT** user request to proceed with installation or updates of specific skills. DO NOT INSTALL OR UPDATE UNLESS DIRECTED TO DO SO.
11. **Download/Update Skills**: For requested skills, automatically:
    - Download entire skill folder (including SKILL.md and all bundled assets)
    - Update outdated skills by replacing with latest version from awesome-copilot
    - Preserve folder structure (scripts/, references/, assets/, examples/)
    - Do NOT adjust content of the files
    - Use `#fetch` tool combined with `#runInTerminal` (curl/wget) to download all skill files

## Context Analysis Criteria

🔍 **Repository Patterns**:

- Programming languages used (.cs, .js, .py, .ts, .bicep, .tf, .go, etc.)
- Framework indicators (ASP.NET, React, Azure, Next.js, Angular, Django, etc.)
- Project types (web apps, APIs, libraries, tools, infrastructure, embedded systems)
- Tools and CLIs (az cli, gh cli, git, docker, terraform, pulumi, npm, nuget)
- Development workflow indicators (CI/CD, testing, deployment, DevOps)
- Cloud platforms (Azure, AWS, GCP)
- Specialized needs (circuit design, image processing, browser automation, documentation)

🗨️ **Chat History Context**:

- Recent discussions and pain points
- Feature requests or implementation needs
- Testing and quality concerns
- Development workflow requirements and challenges
- Technology stack and architecture decisions
- Tool usage patterns and CLI interactions

## Output Format

Display analysis results in structured table showing relevant skills and their potential value:

### Skill Recommendations

| Skill Name                                                                                                          | Description                                                                                                                               | Bundled Assets | Already Installed | Suggestion Rationale                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| [azure-deployment-preflight](https://github.com/github/awesome-copilot/tree/main/skills/azure-deployment-preflight) | Comprehensive preflight validation of Bicep deployments to Azure with template syntax validation, what-if analysis, and permission checks | 3 references   | ❌ No             | Essential for your Pulumi Azure infrastructure - would complement deployment validation workflow |
| [gh-cli](https://github.com/github/awesome-copilot/tree/main/skills/gh-cli)                                         | GitHub CLI comprehensive reference for repositories, issues, pull requests, Actions, projects, releases, gists, codespaces                | None           | ❌ No             | Would enhance GitHub workflow automation and issue management from terminal                      |
| [git-commit](https://github.com/github/awesome-copilot/tree/main/skills/git-commit)                                 | Execute git commit with conventional commit message analysis, intelligent staging, and message generation                                 | None           | ⚠️ Outdated       | Update available: Remote version includes improved type detection for TypeScript projects        |
| [azure-devops-cli](https://github.com/github/awesome-copilot/tree/main/skills/azure-devops-cli)                     | Manage Azure DevOps resources via CLI including projects, repos, pipelines, builds, pull requests, work items, artifacts                  | None           | ❌ No             | Could support CI/CD pipeline management if using Azure DevOps                                    |

### Skill Analysis for Recommended Skills

For each suggested skill, break down components:

**azure-deployment-preflight Skill Analysis:**

- ✅ **New Skill**: Not currently installed
- 📦 **Bundled Assets**: 3 reference documents (ERROR-HANDLING.md, REPORT-TEMPLATE.md, VALIDATION-COMMANDS.md)
- 🎯 **High Value**: Preflight checks for Azure deployments, prevents costly deployment failures
- 🔧 **Activation**: Triggered when deploying to Azure, validating Bicep/ARM templates, running what-if analysis
- 💡 **Use Cases**: Before any `pulumi up`, validating infrastructure changes, permission verification

**Installation Preview:**

- Will install to `.github/skills/azure-deployment-preflight/`:
  - `SKILL.md` - Main skill instructions
  - `references/ERROR-HANDLING.md` - Common deployment errors and solutions
  - `references/REPORT-TEMPLATE.md` - Standard validation report format
  - `references/VALIDATION-COMMANDS.md` - Azure CLI validation command reference

## Local Skill Discovery Process

1. **Scan Skill Directory**:
   - List all folders in `.github/skills/` directory
   - Identify folders containing `SKILL.md` file

2. **Extract Skill Metadata**: For each discovered skill, read `SKILL.md` YAML front matter to extract:
   - `name` - Skill identifier
   - `description` - Primary purpose and functionality
   - `triggers` - Activation keywords and phrases
   - `examples` - Usage scenarios

3. **Build Skill Inventory**: Create comprehensive map of existing capabilities organized by:
   - **Technology Focus**: Programming languages, frameworks, platforms, tools
   - **Workflow Type**: Development, testing, deployment, documentation, automation
   - **Tool Integration**: CLI tools, APIs, external services
   - **Specialization Level**: General purpose vs. highly specialized

4. **Identify Coverage Gaps**: Compare existing skills against:
   - Repository technology stack requirements
   - Development workflow needs indicated by chat history
   - Tool usage patterns (git, az, gh, docker, etc.)
   - Missing expertise areas (deployment validation, testing, documentation, CI/CD)

## Version Comparison Process

1. For each local skill folder that corresponds to an awesome-copilot skill:
   - Construct raw GitHub URL: `https://raw.githubusercontent.com/github/awesome-copilot/main/skills/<skill-name>/SKILL.md`
   - List all files in local skill folder (including subdirectories)
2. Fetch the remote `SKILL.md` using the `#fetch` tool
3. Compare entire file content (including front matter and instructions)
4. Check for additional files in remote skill (scripts/, references/, assets/, examples/)
5. Identify specific differences:
   - **Front matter changes** (name, description, triggers, examples)
   - **Instruction updates** (procedures, commands, workflows)
   - **New bundled assets** (additional scripts or reference files)
   - **Removed or modified assets**
6. Document key differences for outdated skills
7. Calculate similarity to determine if update is needed

## Skill Download Process

When user confirms a skill installation:

1. **Fetch Skill Structure**: Get skill folder listing from awesome-copilot repository
2. **Download SKILL.md**: Fetch main skill instruction file
3. **Download Bundled Assets**: For each additional file in skill folder:
   - Download scripts/ directory contents (if exists)
   - Download references/ directory contents (if exists)
   - Download assets/ directory contents (if exists)
   - Download examples/ directory contents (if exists)
   - Download any root-level files (LICENSE.txt, README.md, etc.)
4. **Create Local Structure**:
   - Create `.github/skills/<skill-name>/` directory
   - Preserve subdirectory structure from remote
   - Place all files in appropriate locations
5. **Validate Installation**: Verify `SKILL.md` exists and is properly formatted
6. **Report Installation**: Provide summary of installed files and usage instructions

## Requirements

- Use `fetch` tool to get skills data from awesome-copilot repository
- Use `githubRepo` tool to get skill folder structure and file listings
- Scan local file system for existing skills in `.github/skills/` directory
- Read `SKILL.md` files from local skills to extract descriptions and capabilities
- Compare skills against repository context to identify relevant matches
- Focus on skills that fill capability gaps or enhance existing workflows
- Validate that suggested skills align with repository's technology stack and tools
- Provide clear rationale for each skill suggestion with specific benefits
- Enable automatic download and installation of complete skill folders with all assets
- Ensure downloaded skills follow repository naming conventions and formatting standards
- Provide usage guidance explaining how skills enhance the development workflow
- Include links to awesome-copilot skills with direct access to SKILL.md files

## Skill Installation Workflow

1. **User Confirms Skill**: User selects specific skill(s) for installation
2. **Fetch Skill Structure**: Enumerate all files in skill folder from awesome-copilot
3. **Download Loop**: For each file in skill:
   - Download raw content from GitHub repository
   - Create necessary subdirectories locally
   - Save file to appropriate location
4. **Installation Summary**: Report installed files with usage instructions
5. **Activation Guide**: Explain trigger phrases and activation patterns

## Post-Installation Guidance

After installing a skill, provide:

- **Skill Overview**: Description of skill capabilities
- **Bundled Assets**: List of included scripts, references, and examples
- **Activation Triggers**: Keywords and phrases that activate the skill
- **Usage Examples**: Common scenarios and use cases
- **Workflow Integration**: Best practices for incorporating skill into development process
- **Related Skills**: Suggestions for complementary skills that work well together

## Icons Reference

- ✅ Skill recommended for installation / Skill up-to-date
- ⚠️ Skill has some overlap but still valuable
- ❌ Skill not recommended (significant overlap or not relevant)
- 🎯 High-value skill that fills major capability gaps
- 📁 Skill partially installed (some assets missing)
- 🔄 Skill outdated (update available from awesome-copilot)
- 📦 Skill includes bundled assets (scripts, references, examples)

## Update Handling

When outdated skills are identified:

1. Include them in the skill analysis with 🔄 status
2. Document specific differences for each outdated skill
3. Provide recommendation to update with key changes noted
4. When user requests update, replace entire skill folder with remote version
5. Preserve location in `.github/skills/<skill-name>/` directory
6. Backup existing skill folder before update (optional)

## Skill vs. Other Primitives

**When to Suggest Skills:**

- Complex workflows requiring bundled resources (scripts, templates, reference data)
- CLI tool integration and automation
- Specialized tasks with supporting documentation
- Workflows needing code samples or helper utilities

**When NOT to Suggest Skills:**

- Simple prompt-based tasks (suggest prompts instead)
- File-pattern-based coding standards (suggest instructions instead)
- Chat-mode expertise (suggest agents instead)
- Grouped workflows (suggest collections instead)

Skills are loaded on-demand and support progressive disclosure, making them ideal for specialized, resource-intensive capabilities.
