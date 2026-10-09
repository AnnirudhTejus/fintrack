'use client'

// Currencies a wallet can hold. A transaction's currency always comes from its wallet.
// To add a currency: add it here and to the wallets_currency_allowed rule in the database.

import { useSyncExternalStore } from 'react'

export const CURRENCIES = [
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', short: 'Ringgit', locale: 'en-MY' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', short: 'Rupee', locale: 'en-IN' },
  { code: 'USD', symbol: '$', name: 'US Dollar', short: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', short: 'Euro', locale: 'en-IE' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', short: 'Singapore Dollar', locale: 'en-SG' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export const DEFAULT_CURRENCY: CurrencyCode = 'MYR'

export function currencyInfo(code?: string | null) {
  return CURRENCIES.find((item) => item.code === code) || CURRENCIES[0]
}

// Wallets saved before currencies existed count as ringgit.
export function walletCurrency(wallet?: { currency?: string | null } | null): CurrencyCode {
  return currencyInfo(wallet?.currency).code
}

// The number alone, grouped the local way: 1,25,000.00 for rupee, 125,000.00 otherwise.
export function formatNumber(value: number, code: string = DEFAULT_CURRENCY, decimals = 2) {
  const formatted = Math.abs(value).toLocaleString(currencyInfo(code).locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${value < 0 ? '-' : ''}${formatted}`
}

// With the symbol: RM 1,234.56, -₹ 1,25,000.00
export function formatMoney(value: number, code: string = DEFAULT_CURRENCY, decimals = 2) {
  const formatted = Math.abs(value).toLocaleString(currencyInfo(code).locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${value < 0 ? '-' : ''}${currencyInfo(code).symbol} ${formatted}`
}

// Currencies of the wallets still in use, in the fixed order above.
export function currenciesInUse(wallets: { currency?: string | null; is_archived?: boolean | null }[]) {
  const used = new Set(wallets.filter((w) => w.is_archived !== true).map((w) => walletCurrency(w)))
  return CURRENCIES.map((item) => item.code).filter((code) => used.has(code))
}

// The currency being viewed is shared by every page and remembered on this device.
const VIEW_KEY = 'fintrack:view-currency'
const VIEW_EVENT = 'fintrack:view-currency-changed'
let viewInMemory: string | null = null

function subscribe(callback: () => void) {
  window.addEventListener(VIEW_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(VIEW_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) ?? viewInMemory
  } catch {
    return viewInMemory
  }
}

export function setViewCurrency(code: CurrencyCode) {
  viewInMemory = code
  try {
    window.localStorage.setItem(VIEW_KEY, code)
  } catch {
    // Storage blocked: the choice still holds until the app is closed.
  }
  window.dispatchEvent(new Event(VIEW_EVENT))
}

// The chosen currency, if it is one still in use; otherwise the first in use (ringgit first).
export function useViewCurrency(available: CurrencyCode[]): CurrencyCode {
  const stored = useSyncExternalStore(subscribe, readView, () => null)
  if (stored && (available as string[]).includes(stored)) return stored as CurrencyCode
  return available[0] ?? DEFAULT_CURRENCY
}
