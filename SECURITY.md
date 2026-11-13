# Security

## Review, November 2026

Money manager keeps my own finances in a local SQLite file. Before making the repository public-facing I reviewed it for what could leak or be abused: secrets and personal data in the code and history, what the phone app accepts from outside, and what is reachable on the local network. The review was AI-assisted (Claude Code); findings were checked against the code.

### Fixed

| Area | Problem | Fix |
|---|---|---|
| Deep link | Any app or web page could open `money://sync` and make the phone upload the whole finance DB to any URL, or overwrite data from one, with no prompt | Only http(s) addresses on the local network, no credentials in the URL, and nothing runs until I tap a button showing the target host; unit-tested |
| Personal data | My own masked card numbers, card tails and a bank account number sat in comments, tests and one categorisation rule | Replaced with fake values throughout the branch history (rewritten; GitHub may serve the old commits by SHA until it garbage-collects them); the one real rule now comes from `PERSONAL_CATEGORY_RULES` in a local env file; unit-tested |

No API keys or tokens were found in the code or history.

### Known limitations

- `npm run dev:lan` exposes the web app to the local network; only `/api/export` checks a token.
- The phone's self-update is fetched over the LAN without a hash check.
- Bank push notifications are stored locally and can end up in device backups.
