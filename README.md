# FinTrack

A personal finance tracker for recording and reviewing transactions, wallets, categories, vendors and transfers, with a dashboard summary and CSV export.

## Stack

- Next.js (App Router, TypeScript), React client components
- Supabase (PostgreSQL), queried directly from the app
- Vercel for hosting, deployed automatically from GitHub

## Environments

| Environment | Branch | Supabase project | Data |
|---|---|---|---|
| Production | `main` | Fintrack-Production | Real data |
| Test | `test` | AnnirudhTejus's Project | Dummy data (rows noted `[dummy]`) |

Both Supabase projects are on the free plan and pause after about a week without use. The app then shows "TypeError: Failed to fetch". Restore the project from the Supabase dashboard; no data is lost.

## Release flow

1. Commit and push to `test`. Vercel builds a preview site against the test database.
2. Check the change on the preview site, on a phone as well as a laptop.
3. If the change needs a database change, apply it to the test database first, then to production before the code is released.
4. Merge `test` into `main` and push. Vercel deploys production.

## Environment variables

Set in `.env.local` for local development and in the Vercel project settings for deployments:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000.

## Key rules

**Wallet balances** are calculated in one place, `lib/walletBalance.ts`, and used by the dashboard, the wallets page and the wallet ledger.

- Balance = opening balance + income - expense - investment + transfers in - transfers out.
- A wallet's opening balance is "as at end of" an optional date. Transactions after that date are added to it. Within the month of that date the balance is worked back to the 1st. Earlier months have no known balance and show a dash.
- A wallet with no opening date starts from its opening balance at its first transaction. Months before that show a dash.
- Money in and money out always show what actually moved in a period.

**Currency** belongs to the wallet (MYR, INR, USD, EUR, SGD; list in `lib/currency.ts`). A transaction takes its wallet's currency.

- Totals never mix currencies. Dashboard and Transactions show one currency at a time, chosen with the switch next to the title. The choice is remembered on the device and shared by both pages. The switch only appears when wallets exist in two or more currencies.
- Rupee amounts use Indian grouping (1,25,000.00).
- A wallet's currency cannot change once it has transactions (database trigger `wallets_currency_locked`).
- Transfers must be between wallets of the same currency (database trigger `transaction_same_currency_transfer`). Moving money between currencies (Exchange) is planned.
- The same wallet name can exist once per currency and type (for example Wise in RM, ₹ and $).

**Transaction dates** cannot be in the future. The app checks against the device's local date. The database rule (`transaction_date_not_in_future`) allows up to its own date plus one day, because the database runs on UTC and Malaysia is 8 hours ahead.

## Database changes

| Date | Change |
|---|---|
| Oct 2026 | `transaction_date_not_in_future` relaxed to `date <= CURRENT_DATE + 1` |
| Oct 2026 | `wallets.opening_balance` (numeric, default 0) and `wallets.opening_balance_date` (date) added |
| Oct 2026 | `wallets.currency` (text, default MYR, allowed list), triggers `wallets_currency_locked` and `transaction_same_currency_transfer`, unique wallet name per type and currency |
