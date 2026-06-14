# Security Policy

## Supported Versions

This project is an early private Discord bridge pilot. Security fixes are only
maintained for the current `main` branch unless a release branch is explicitly
created later.

| Version | Supported |
| ------- | --------- |
| `main` | Yes |

## Reporting a Vulnerability

Please do not open a public issue for suspected security problems.

Preferred reporting path:

1. Use GitHub private vulnerability reporting or a private security advisory if
   it is available for this repository.
2. If that is not available, contact the repository maintainer privately first.

When reporting, please include:

- affected commit or branch
- reproduction steps
- expected impact
- whether any Discord token, worker shared secret, Codex auth state, GitHub
  credential, or local filesystem path may have been exposed
- any workaround already identified

Please avoid public disclosure until the issue has been reviewed and answered.
