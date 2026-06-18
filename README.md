# Credit Card Manager

A desktop app for tracking credit card churning. It keeps your cards, signup
bonuses, recurring credits, annual-fee renewals, 5/24 status, and point balances
in one place, across multiple people and businesses.

It runs locally and stores everything in a SQLite file on your computer. There
is no server and no account.

## Features

- Cards across people and businesses, with statement and payment dates, annual
  fees, and status (applied, open, closed, rejected).
- Signup bonuses with spend targets, deadlines, and progress. The bonus value is
  calculated from your point valuations rather than typed in by hand.
- Point programs, each with an owner, a balance, and a cents-per-point value.
- Recurring benefits with use-by dates, a view of what's available or expiring,
  and a used/not-used toggle.
- 5/24 tracking per person, including when the next slot opens up.
- Referrals between the people you manage.
- Credit report import. Load an Equifax PDF and it creates a card for each
  account, matching what it can to known products; you fill in the rest.
- A list of cards that are missing important details, so you can complete them
  over time instead of all at once.
- Export to JSON (with restore) or CSV.

## Download

Get the latest release from the
[releases page](https://github.com/itsdrewmiller/credit-card-manager/releases/latest).

- macOS (Apple Silicon): open the `.dmg` and drag the app to Applications.
- Windows: run the `.exe`.

Your data is created the first time you open the app. To build it yourself, see
[AGENTS.md](./AGENTS.md).

## Privacy

Nothing leaves your machine. Credit report PDFs and any spreadsheet you import
are only read locally. Use the export feature to keep your own backups.

## More

- Roadmap: [FEATURE_MAP.md](./FEATURE_MAP.md)
- Development setup and architecture: [AGENTS.md](./AGENTS.md)
