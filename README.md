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

## Download & install

Get the latest installer from the releases page — it runs like any other desktop
app, no technical setup required. Your data is created on first launch and stays
on your computer.

➡️ **[Download the latest release](https://github.com/itsdrewmiller/credit-card-manager/releases/latest)**
&nbsp;·&nbsp; [all releases](https://github.com/itsdrewmiller/credit-card-manager/releases)

On the release, open **Assets** and pick the file for your computer:

### macOS

1. Download the **`.dmg`** file.
2. Open it and drag **Credit Card Manager** into your Applications folder.
3. The first time, **right-click the app → Open**, then confirm. (The build is
   ad-hoc signed but not from an identified Apple developer, so a normal
   double-click is blocked.) On macOS Ventura and later you may instead need to
   open **System Settings → Privacy & Security**, scroll down, and click **Open
   Anyway**. After the first time it opens normally.

> **"…is damaged and can't be opened"?** That's macOS quarantine on a downloaded
> unsigned app. Clear it once in Terminal, then open the app:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Credit Card Manager.app"
> ```

> The macOS build is currently **Apple Silicon (arm64)** only.

### Windows

1. Download the **`.exe`** installer.
2. Run it. If Windows SmartScreen warns, click **More info → Run anyway** (the
   build isn't code-signed yet), then follow the installer.

No installer for your platform yet? You can also
[build from source](./AGENTS.md).

## Your data is private

The app is local-first: there is no server and nothing is uploaded. Your credit
report PDFs and any spreadsheet you import are only ever read on your machine.
Use **Export & Backup** regularly to keep your own copy.

---

Building from source or contributing? See [AGENTS.md](./AGENTS.md) for setup,
architecture, and the development workflow. The feature roadmap lives in
[FEATURE_MAP.md](./FEATURE_MAP.md).
