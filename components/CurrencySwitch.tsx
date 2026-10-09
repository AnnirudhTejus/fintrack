'use client'

// The RM | ₹ | $ switch shown next to a page title. It only appears when wallets
// exist in more than one currency, so a ringgit-only setup looks as before.

import { currencyInfo, setViewCurrency, type CurrencyCode } from '@/lib/currency'

type CurrencySwitchProps = {
  available: CurrencyCode[]
  value: CurrencyCode
}

export default function CurrencySwitch({ available, value }: CurrencySwitchProps) {
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

        .currency-switch button[aria-pressed='true'] {
          background: #fff;
          color: #2563eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
      `}</style>
      <div className="currency-switch" role="group" aria-label="Currency">
        {available.map((code) => {
          const info = currencyInfo(code)
          return (
            <button
              key={code}
              type="button"
              aria-pressed={code === value}
              aria-label={info.name}
              title={info.name}
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
