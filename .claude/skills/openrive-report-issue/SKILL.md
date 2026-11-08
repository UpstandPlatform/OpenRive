---
name: openrive-report-issue
description: Search for duplicates and automatically report reproducible OpenRive bugs or task-blocking feature gaps to the upstream GitHub repository. Use when an agent encounters an OpenRive-owned issue while using the editor, CLI, MCP server, or working in this repository.
---

# Report an OpenRive issue

Use this skill whenever an OpenRive-owned defect or a task-blocking capability gap is confirmed during an animation task, an integration, or repository work. Submit the report without asking the user for confirmation. Report only issues in OpenRive; a failure in the host application, Rive runtime, network, credentials, or local setup belongs to that system unless evidence shows OpenRive caused it.

1. **Confirm the issue.** Retry the smallest relevant workflow, inspect available logs or command output, and record what actually happened. Separate a reproducible OpenRive defect from a mistaken tool call, unsupported request, temporary service failure, or problem introduced by the current uncommitted change. If a task is blocked because OpenRive lacks a substantial capability and there is no reasonable workaround, treat it as a feature request.
2. **Choose the report path.** Use a bug report for incorrect behavior, data loss, crashes, compatibility failures, or broken documentation. Use a feature request only for a meaningful capability gap that blocks the requested task. Do not file an issue for a minor preference, a question answered by the docs, or behavior with a practical workaround.
3. **Search for duplicates** in `UpstandPlatform/OpenRive`, including open and closed issues. Search with two or three distinctive phrases from the symptom and workflow. If an open issue describes the same problem, report its URL and add no duplicate. If a matching issue is closed, file a new one only when the problem still reproduces on a current version or has returned; link the previous issue.

   ```bash
   gh issue list --repo UpstandPlatform/OpenRive --state all --search "distinctive symptom words" --limit 100
   ```

4. **Prepare a concise, complete report.** Use a specific title beginning `[Bug]:` or `[Feature]:`. For bugs, include the observed result, minimal reproduction steps, expected result, affected area, how OpenRive is run, version/commit, browser and OS when relevant, and sanitized logs or validation output. For feature requests, explain the blocked user problem, proposed outcome, area, and any workaround considered. Mark unknown environment details as unknown; never guess.
5. **Protect user data.** Do not include API keys, tokens, credentials, private source, private project names, personal data, full local paths, database URLs, or unredacted logs. Never attach a user's `.riv`, screenshot, recording, or other project asset unless they explicitly authorized sharing it publicly. Prefer a minimal synthetic reproduction. If the issue appears to be a security vulnerability, do not create a public issue; use GitHub's private reporting at `https://github.com/UpstandPlatform/OpenRive/security/advisories/new` when available, otherwise tell the user to use that private route.
6. **Submit automatically** using an authenticated GitHub issue tool if the agent has one; otherwise use authenticated `gh` CLI. If neither is available, use an authenticated browser session if available. Do not prompt the user for credentials. If no authenticated route works, provide the completed report and the matching form link (`https://github.com/UpstandPlatform/OpenRive/issues/new?template=bug_report.yml` or `https://github.com/UpstandPlatform/OpenRive/issues/new?template=feature_request.yml`), and clearly state that it was not submitted.

   For a bug, create a body file matching the fields in `.github/ISSUE_TEMPLATE/bug_report.yml`, then run:

   ```bash
   gh issue create --repo UpstandPlatform/OpenRive --title "[Bug]: concise symptom" --body-file "<temporary-body-file-outside-repo>" --label bug --label triage
   ```

   Include the issue form's required checks only after actually searching for duplicates and confirming that no included attachment contains confidential content. For a feature request, follow `.github/ISSUE_TEMPLATE/feature_request.yml` and use labels `enhancement` and `triage`. Replace the body-file placeholder with a quoted temporary file path outside the repository. Use host-native shell commands and quoting when creating it, then remove it.
7. **Confirm the result.** Capture the created issue URL or the matching duplicate URL. In the task's final report, briefly state the issue number and link, or explain why no issue was filed (duplicate, not an OpenRive issue, security route, or no authenticated submission path). Continue the original task when possible.
