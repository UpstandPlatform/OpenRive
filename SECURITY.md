# Security Policy

OpenRive takes security reports seriously. Please report suspected vulnerabilities privately so they can be investigated
and fixed before details become public.

## Supported versions

Security fixes are provided for the latest tagged release and the current `main` branch. Older releases are not
guaranteed to receive fixes; upgrade to the latest release where possible.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| `main` | Yes |
| Older releases | No guarantee |

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting form](https://github.com/UpstandPlatform/OpenRive/security/advisories/new).
Do not report suspected vulnerabilities in public issues, discussions, pull requests, or other public channels.

If the private form is unavailable, do not post technical details publicly. Open a public issue or discussion with only a
request for a private security contact, and the maintainers can provide a reporting route.

When possible, include:

- The affected OpenRive version, commit, package, or deployment mode.
- The security impact and conditions needed to reproduce it.
- Clear reproduction steps or a minimal proof of concept.
- Any suggested mitigation or fix.

Please avoid accessing, changing, or deleting other people's data; disrupting services; or testing against systems you
do not own or have permission to assess. Do not include real credentials, private user data, or unrelated files in a
report.

## Coordinated disclosure

Please give the maintainers a reasonable opportunity to investigate, prepare a fix, and coordinate a public advisory
before publishing vulnerability details. The maintainers will work with reporters on the scope and timing of disclosure
and will credit reporters in an advisory when requested and appropriate. We do not promise a response or remediation
timeline, and OpenRive does not currently offer a security bounty.

This policy covers the OpenRive repository and software maintained here. For an issue that exists only in an upstream
dependency or the Rive runtime, please also report it through that project's security process.
