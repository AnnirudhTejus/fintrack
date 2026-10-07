// Single source of truth for wallet balances.
//
// A wallet has an opening balance "as at end of" an optional date.
// - Date set:   only transactions dated AFTER that date count.
// - Date blank: every transaction counts.
//
// Balance = opening balance + income - expense - investment + transfers in - transfers out
//
// All dates are plain YYYY-MM-DD strings, so they compare correctly as text
// and never shift with timezone.

export type BalanceWallet = {
  id: number
  opening_balance?: number | string | null
  opening_balance_date?: string | null
}

export type BalanceTransaction = {
  type: string
  amount: number | string
  date: string
  wallet_id: number | null
  transfer_wallet_id: number | null
}

export type WalletPeriodSummary = {
  opening: number
  moneyIn: number
  moneyOut: number
  closing: number
}

function dateOnly(value: string) {
  return (value || '').slice(0, 10)
}

export function openingBalanceOf(wallet: BalanceWallet) {
  const value = Number(wallet.opening_balance)
  return Number.isFinite(value) ? value : 0
}

// Signed effect of one transaction on one wallet. 0 if it does not touch the wallet.
export function walletEffect(tx: BalanceTransaction, walletId: number) {
  const amount = Number(tx.amount) || 0

  if (tx.type === 'Transfer') {
    let effect = 0
    if (tx.wallet_id === walletId) effect -= amount
    if (tx.transfer_wallet_id === walletId) effect += amount
    return effect
  }

  if (tx.wallet_id !== walletId) return 0
  if (tx.type === 'Income') return amount
  if (tx.type === 'Expense' || tx.type === 'Investment') return -amount
  return 0
}

// Transactions on or before the opening balance date are already inside the opening figure.
export function countsTowardBalance(tx: BalanceTransaction, wallet: BalanceWallet) {
  const openingDate = wallet.opening_balance_date ? dateOnly(wallet.opening_balance_date) : ''
  if (!openingDate) return true
  return dateOnly(tx.date) > openingDate
}

// Opening and closing balance for a period, plus the money in and out between them.
// from/to are inclusive YYYY-MM-DD strings; null means open-ended.
export function walletPeriodSummary(
  wallet: BalanceWallet,
  transactions: BalanceTransaction[],
  from: string | null,
  to: string | null
): WalletPeriodSummary {
  let opening = openingBalanceOf(wallet)
  let moneyIn = 0
  let moneyOut = 0

  transactions.forEach((tx) => {
    const effect = walletEffect(tx, wallet.id)
    if (effect === 0) return
    if (!countsTowardBalance(tx, wallet)) return

    const txDate = dateOnly(tx.date)
    if (to && txDate > to) return

    if (from && txDate < from) {
      opening += effect
      return
    }

    if (effect > 0) moneyIn += effect
    else moneyOut += -effect
  })

  return {
    opening,
    moneyIn,
    moneyOut,
    closing: opening + moneyIn - moneyOut,
  }
}

// Balance at the end of a given day (or of everything recorded, if no day is given).
export function walletBalance(
  wallet: BalanceWallet,
  transactions: BalanceTransaction[],
  asOf: string | null = null
) {
  return walletPeriodSummary(wallet, transactions, null, asOf).closing
}
