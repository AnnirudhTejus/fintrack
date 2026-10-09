'use client'

// Wallet chooser for the transaction form.
// Phones: a button that opens a panel listing every wallet, grouped by currency.
// Laptops: an ordinary dropdown with a heading per currency.

import { useEffect, useState } from 'react'
import { CURRENCIES, currencyInfo, walletCurrency, type CurrencyCode } from '@/lib/currency'

export type PickerWallet = {
  id: number
  name: string
  currency?: string | null
}

type WalletPickerProps = {
  wallets: PickerWallet[]
  value: string
  onChange: (walletId: string) => void
  placeholder: string
  sheetTitle: string
  // This currency's group is listed first (the one being viewed).
  firstCurrency?: CurrencyCode
  // Short line under the list, for example why some wallets are missing.
  hint?: string
  inputStyle: React.CSSProperties
}

export default function WalletPicker({
  wallets,
  value,
  onChange,
  placeholder,
  sheetTitle,
  firstCurrency,
  hint,
  inputStyle,
}: WalletPickerProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const order = CURRENCIES.map((item) => item.code as CurrencyCode).sort((a, b) =>
    a === firstCurrency ? -1 : b === firstCurrency ? 1 : 0
  )
  const groups = order
    .map((code) => ({ info: currencyInfo(code), wallets: wallets.filter((w) => walletCurrency(w) === code) }))
    .filter((group) => group.wallets.length > 0)
  const grouped = groups.length > 1

  // Wallets sharing a name (Wise in RM and Wise in ₹) carry their currency symbol.
  const nameCount: Record<string, number> = {}
  wallets.forEach((w) => {
    const key = w.name.trim().toLowerCase()
    nameCount[key] = (nameCount[key] || 0) + 1
  })
  const isShared = (w: PickerWallet) => nameCount[w.name.trim().toLowerCase()] > 1

  const selected = wallets.find((w) => String(w.id) === value)

  function pick(id: number) {
    onChange(String(id))
    setOpen(false)
  }

  return (
    <>
      <style>{`
        .wallet-picker-button {
          display: none;
        }

        .wallet-picker-shade {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(15, 23, 42, 0.35);
          display: flex;
          align-items: flex-end;
        }

        .wallet-picker-sheet {
          width: 100%;
          max-height: 75vh;
          overflow-y: auto;
          box-sizing: border-box;
          background: #fff;
          border-radius: 18px 18px 0 0;
          padding: 10px 12px calc(16px + env(safe-area-inset-bottom));
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.2);
        }

        .wallet-picker-handle {
          width: 40px;
          height: 5px;
          border-radius: 9px;
          background: #cbd5e1;
          margin: 0 auto 10px;
        }

        .wallet-picker-group {
          padding: 12px 8px 4px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #64748b;
        }

        .wallet-picker-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 13px 12px;
          border: none;
          border-radius: 10px;
          background: transparent;
          font: inherit;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          text-align: left;
          cursor: pointer;
        }

        .wallet-picker-item[aria-selected='true'] {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .wallet-picker-tag {
          font-size: 13px;
          font-weight: 700;
          color: #94a3b8;
        }

        @media (max-width: 640px) {
          .wallet-picker-native {
            display: none !important;
          }

          .wallet-picker-button {
            display: flex;
          }
        }
      `}</style>

      <select
        className="wallet-picker-native"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        <option value="">{placeholder}</option>
        {grouped
          ? groups.map((group) => (
              <optgroup key={group.info.code} label={`${group.info.short} · ${group.info.symbol}`}>
                {group.wallets.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                    {isShared(w) ? ` (${group.info.symbol})` : ''}
                  </option>
                ))}
              </optgroup>
            ))
          : wallets.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
      </select>

      <button
        type="button"
        className="wallet-picker-button"
        onClick={() => setOpen(true)}
        style={{
          ...inputStyle,
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          color: selected ? '#111827' : '#6b7280',
        }}
      >
        <span>{selected ? selected.name : placeholder}</span>
        <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected && grouped && (
            <span className="wallet-picker-tag">{currencyInfo(walletCurrency(selected)).short}</span>
          )}
          <span aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div className="wallet-picker-shade" onClick={() => setOpen(false)}>
          <div
            className="wallet-picker-sheet"
            role="listbox"
            aria-label={sheetTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wallet-picker-handle" />
            <div style={{ fontWeight: 800, fontSize: '16px', padding: '0 8px 4px' }}>{sheetTitle}</div>

            {wallets.length === 0 && (
              <div style={{ padding: '12px 8px', color: '#64748b', fontSize: '14px' }}>No wallets to choose.</div>
            )}

            {groups.map((group) => (
              <div key={group.info.code}>
                {grouped && (
                  <div className="wallet-picker-group">
                    {group.info.short} · {group.info.symbol}
                  </div>
                )}
                {group.wallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="option"
                    aria-selected={String(w.id) === value}
                    className="wallet-picker-item"
                    onClick={() => pick(w.id)}
                  >
                    <span>{w.name}</span>
                    {isShared(w) && <span className="wallet-picker-tag">{group.info.symbol}</span>}
                  </button>
                ))}
              </div>
            ))}

            {hint && (
              <div
                style={{
                  margin: '10px 4px 0',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: '12px',
                }}
              >
                {hint}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
