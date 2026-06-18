# Credit Card Manager

A private desktop app for credit-card churning. It replaces the unwieldy
tracking spreadsheet with something purpose-built: your cards, the signup
bonuses you're working, your recurring perks and renewal cycles, your 5/24
velocity, and what your points are actually worth — for you, your spouse, and
your businesses.

Everything lives in a single SQLite file on your own machine. **No cloud, no
account, no one else can see it.**

## What it does

- **Cards** — every card across people and businesses, with statement/payment
  dates, annual fees, and lifecycle status (applied → open → closed/rejected).
- **Signup bonuses** — spend target, deadline, and progress, with the bonus's
  **cash value computed automatically** from your point valuations (so "60,000
  points" shows up as real dollars, and never goes stale).
- **Points** — each program (Amex MR, Chase UR, airline miles…) with an owner,
  a balance, and a cents-per-point valuation that drives every bonus's worth.
- **Benefits** — recurring credits and perks (dining, travel, subscriptions)
  with use-by windows, an "available now / expiring soon" view, and a one-click
  *used* toggle so nothing is left on the table.
- **5/24 velocity** — how many personal cards each person has opened in the last
  24 months, who's under the limit, and when the next slot frees up.
- **Referrals** — track referrals between the people you manage: who referred
  whom, for which card, and whether the bonus has paid.
- **Import your credit report** — drop in an Experian PDF and it bootstraps your
  cards automatically, matching each account to a known card product. Anything
  it can't fully identify becomes a card you finish later (see below).
- **Needs-info inbox** — instead of forcing you to fill everything up front, the
  app flags cards missing the details that matter for churning and walks you
  through them one at a time.
- **Export & backup** — download a full JSON backup (and restore from it), or
  CSV files per table for analysis in Excel or Sheets.

## Who it's for

Anyone running an active churning setup (r/churning style) who has outgrown a
spreadsheet — especially across **multiple people and businesses**, with
referrals between them.

## Installing

Download the installer for your platform and open it — it runs like any other
desktop app, no technical setup required. Your data is created on first launch
and stays on your computer.

> macOS builds are currently unsigned, so the first launch may need a
> right-click → **Open** to get past Gatekeeper.

## Your data is private

The app is local-first: there is no server and nothing is uploaded. Your credit
report PDFs and any spreadsheet you import are only ever read on your machine.
Use **Export & Backup** regularly to keep your own copy.

---

Building from source or contributing? See [AGENTS.md](./AGENTS.md) for setup,
architecture, and the development workflow. The feature roadmap lives in
[FEATURE_MAP.md](./FEATURE_MAP.md).
