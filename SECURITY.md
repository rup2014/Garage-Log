# Security policy

Garage Log is a static site with no server or database of its own: each visitor's data stays in their browser and, if they turn on sync, their own Google Drive.

## Reporting a vulnerability

Please report security problems privately through GitHub's **[Report a vulnerability](https://github.com/rup2014/Garage-Log/security/advisories/new)** form, not in a public issue. Include what you found, how to reproduce it, and what it could affect. We'll reply as soon as we can and credit you in the fix if you'd like.

## Scope

In scope: the code in this repository and the site at https://rup2014.github.io/Garage-Log/, for example cross-site scripting, ways to read another site's data, or ways to misuse the Google Drive or Anthropic integrations.

Out of scope: problems in GitHub Pages, Google or Anthropic themselves (report those to them), and attacks that need physical access to an unlocked device or a malicious browser extension.

## For users

- Your Anthropic API key, if you add one, is stored in your browser. Remove it in Settings if others use your browser profile, and set a spending limit in the Anthropic Console.
- Download backups regularly; we can't recover lost data.
