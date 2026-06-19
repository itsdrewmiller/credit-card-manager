# Signup-bonus dataset — column spec

A normalized, machine-readable format for tracking available card signup bonuses.
See `signup_bonuses.sample.csv` for example rows. Use a **stable filename** for
the live file (e.g. `signup_bonuses.csv`) so git history is the change-log.

| Column | Type | Notes |
|---|---|---|
| `card_name` | string | Product name, e.g. `Chase Ink Preferred` |
| `issuer` | string | Bank, e.g. `Chase`, `American Express`, `Capital One` |
| `is_business` | bool | `true` / `false` |
| `bonus_amount` | number | The headline number — points, miles, dollars, or nights |
| `bonus_currency` | enum-ish | Unit of `bonus_amount`: `Amex MR`, `Chase UR`, `Capital One miles`, `United miles`, `Citi TY`, `USD` (cash), `hotel nights`, … |
| `point_value_cpp` | number | Assumed cents-per-point. Blank for `USD` and `hotel nights` |
| `bonus_value_usd` | number | USD value of the bonus: `bonus_amount` if cash, else `round(bonus_amount × point_value_cpp / 100)`. Blank when not computable (e.g. nights) |
| `min_spend_usd` | number | Minimum spend to earn the bonus |
| `spend_window_months` | number | Months allowed to meet `min_spend_usd` |
| `annual_fee_usd` | number | Annual fee; `0` if none |
| `annual_fee_waived_y1` | bool | `true` if waived the first year |
| `first_year_credits_usd` | number | Estimated USD value of recurring credits/perks usable in year one |
| `estimated_first_year_value_usd` | number | Overall first-year value (≈ `bonus_value_usd` + `first_year_credits_usd` − unwaived `annual_fee_usd`) |
| `notes` | string | Free text (e.g. specific credits, caveats) |
| `source` | string | Where the offer came from |
| `source_url` | string | Link to the source |
| `source_checked` | date | `YYYY-MM-DD` the data was verified |

Conventions
- Booleans are lowercase `true` / `false`.
- Money columns are plain numbers in USD with no `$` or thousands separators.
- Empty cell = unknown / not applicable (don't use `0` to mean "unknown").
- One row per card product. Keep `card_name` stable so diffs track the same card
  over time.

This maps directly onto the app's **Available offers** (`product_offer`):
`bonus_amount`/`bonus_currency`/`point_value_cpp` → reward, `min_spend_usd` →
min spend, `spend_window_months` → window — so the file can later be imported.
