// Single source of truth for wallet balances.
//
// A wallet has an opening balance "as at end of" an optional date.
//
// - Date set: that figure is the one known point. Balances after it are worked
//   forward from the transactions. Within the month the date falls in, earlier
//   days are worked backward from it. Any earlier month has no known balance
//   and returns null, shown as a dash.
// - Date blank: the wallet starts at the opening balance and every transaction counts.
//
// Money in and money out are always what actually moved in the period,
// whether or not a balance is known for it.
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
  opening: number | null
  moneyIn: number
  moneyOut: number
  closing: number | null
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

function openingDateOf(wallet: BalanceWallet) {
  return wallet.opening_balance_date ? dateOnly(wallet.opening_balance_date) : ''
}

// Balance at a cut-off. includeCutoffDay = true means "at the end of that day",
// false means "at the start of that day". Returns null when it is not known.
function balanceAt(
  wallet: BalanceWallet,
  transactions: BalanceTransaction[],
  cutoff: string,
  includeCutoffDay: boolean
): number | null {
  const openingDate = openingDateOf(wallet)
  let balance = openingBalanceOf(wallet)

  const isBeforeCutoff = (txDate: string) => (includeCutoffDay ? txDate <= cutoff : txDate < cutoff)

  // No date: the wallet starts at the opening balance and everything counts.
  if (!openingDate) {
    transactions.forEach((tx) => {
      if (isBeforeCutoff(dateOnly(tx.date))) balance += walletEffect(tx, wallet.id)
    })
    return balance
  }

  const cutoffIsAfterOpeningDate = includeCutoffDay ? cutoff >= openingDate : cutoff > openingDate

  // On or after the known point: work forward.
  if (cutoffIsAfterOpeningDate) {
    transactions.forEach((tx) => {
      const txDate = dateOnly(tx.date)
      if (txDate > openingDate && isBeforeCutoff(txDate)) balance += walletEffect(tx, wallet.id)
    })
    return balance
  }

  // Earlier in the same month as the known point: work backward.
  if (cutoff.slice(0, 7) === openingDate.slice(0, 7)) {
    transactions.forEach((tx) => {
      const txDate = dateOnly(tx.date)
      if (txDate <= openingDate && !isBeforeCutoff(txDate)) balance -= walletEffect(tx, wallet.id)
    })
    return balance
  }

  // An earlier month: not known.
  return null
}

// Opening and closing balance for a period, plus the money in and out between them.
// from/to are inclusive YYYY-MM-DD strings; null means open-ended.
export function walletPeriodSummary(
  wallet: BalanceWallet,
  transactions: BalanceTransaction[],
  from: string | null,
  to: string | null
): WalletPeriodSummary {
  let moneyIn = 0
  let moneyOut = 0
  let lastDate = ''

  transactions.forEach((tx) => {
    const effect = walletEffect(tx, wallet.id)
    if (effect === 0) return

    const txDate = dateOnly(tx.date)
    if (txDate > lastDate) lastDate = txDate
    if (from && txDate < from) return
    if (to && txDate > to) return

    if (effect > 0) moneyIn += effect
    else moneyOut += -effect
  })

  const openingDate = openingDateOf(wallet)

  // With no start date the period begins before anything was recorded.
  const opening = from
    ? balanceAt(wallet, transactions, from, false)
    : openingDate
      ? null
      : openingBalanceOf(wallet)

  // With no end date the period runs to the latest thing recorded.
  const endDate = to || (lastDate > openingDate ? lastDate : openingDate)
  const closing = endDate ? balanceAt(wallet, transactions, endDate, true) : openingBalanceOf(wallet)

  return { opening, moneyIn, moneyOut, closing }
}

// Balance at the end of a given day (or of everything recorded, if no day is given).
export function walletBalance(
  wallet: BalanceWallet,
  transactions: BalanceTransaction[],
  asOf: string | null = null
) {
  return walletPeriodSummary(wallet, transactions, null, asOf).closing ?? openingBalanceOf(wallet)
}
