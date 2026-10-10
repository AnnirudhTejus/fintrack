'use client'

// The RM | ₹ | $ switch shown next to a page title. It only appears when wallets
// exist in more than one currency, so a ringgit-only setup looks as before.

import { currencyInfo, setViewCurrency, type CurrencyCode } from '@/lib/currency'

type CurrencySwitchProps = {
  available: CurrencyCode[]
  value: CurrencyCode
  // Greyed out with nothing selected, for lists that cover every currency.
  disabled?: boolean
}

export default function CurrencySwitch({ available, value, disabled = false }: CurrencySwitchProps) {
  if (available.length < 2) return null

  return (
    <>
      <style>{`
        .currency-switch {
          display: inline-flex;
          max-width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
          background: #e2e8f0;
          border-radius: 999px;
          padding: 3px;
          vertical-align: middle;
        }

        .currency-switch::-webkit-scrollbar {
          display: none;
        }

        .currency-switch button {
          flex: none;
          border: none;
          background: transparent;
          padding: 6px 13px;
          border-radius: 999px;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          color: #334155;
          cursor: pointer;
        }

        .currency-switch[aria-disabled='true'] {
          opacity: 0.45;
        }

        .currency-switch[aria-disabled='true'] button {
          cursor: default;
        }

        .currency-switch button[aria-pressed='true'] {
          background: #fff;
          color: #2563eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
      `}</style>
      <div
        className="currency-switch"
        role="group"
        aria-label="Currency"
        aria-disabled={disabled}
        title={disabled ? 'Showing all currencies' : undefined}
      >
        {available.map((code) => {
          const info = currencyInfo(code)
          return (
            <button
              key={code}
              type="button"
              aria-pressed={!disabled && code === value}
              aria-label={info.name}
              title={disabled ? undefined : info.name}
              disabled={disabled}
              onClick={() => setViewCurrency(code)}
            >
              {info.symbol}
            </button>
          )
        })}
      </div>
    </>
  )
}
