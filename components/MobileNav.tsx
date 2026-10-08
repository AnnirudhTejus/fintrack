'use client'

// Bottom navigation bar, shown on phone-sized screens only (640px and below).
// Laptops keep the existing buttons at the top of each page.
//
// The + opens the Add Transaction form from any page. After a save it sends a
// 'fintrack:transactions-changed' event so the page underneath reloads its data.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TransactionForm, {
  loadTransactionLookups,
  type TransactionFormValues,
} from '@/components/TransactionForm'
import Toast from '@/components/Toast'

export const TRANSACTIONS_CHANGED_EVENT = 'fintrack:transactions-changed'

const NEW_TRANSACTION_DEFAULTS = { type: 'Expense' as const }

type IconName = 'home' | 'list' | 'wallet' | 'more'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M16 12h2M3 9h18" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </>
    ),
  }

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export default function MobileNav() {
  const pathname = usePathname() || '/'
  const [showMore, setShowMore] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [successMessage, setSuccessMessage] = useState('')

  // On phones, download the form's lists early so the first tap on + is instant.
  useEffect(() => {
    if (window.matchMedia('(max-width: 640px)').matches) loadTransactionLookups()
  }, [])

  // Stop the page behind the form from scrolling while it is open.
  useEffect(() => {
    if (!showForm) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [showForm])

  const isDashboard = pathname === '/'
  const isTransactions = pathname.startsWith('/transactions')
  const isWallets = pathname.startsWith('/wallets')
  const isMore = pathname.startsWith('/categories') || pathname.startsWith('/vendors')

  function openForm() {
    setShowMore(false)
    setFormKey((value) => value + 1)
    setShowForm(true)
  }

  async function handleSave(values: TransactionFormValues) {
    const { error } = await supabase.from('transaction').insert([values])
    if (error) throw new Error(error.message)

    setShowForm(false)
    setSuccessMessage('Transaction added successfully.')
    window.dispatchEvent(new Event(TRANSACTIONS_CHANGED_EVENT))
  }

  return (
    <>
      <style>{`
        .mobile-nav,
        .mobile-nav-sheet,
        .mobile-nav-shade {
          display: none;
        }

        @media (max-width: 640px) {
          .mobile-nav {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 60;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            align-items: center;
            height: 64px;
            padding-bottom: env(safe-area-inset-bottom);
            background: #fff;
            border-top: 1px solid #e5e7eb;
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.05);
          }

          .mobile-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            padding: 6px 0;
            border: none;
            background: transparent;
            color: #64748b;
            font: inherit;
            font-size: 11px;
            font-weight: 700;
            text-decoration: none;
            cursor: pointer;
          }

          .mobile-nav-item.is-active {
            color: #2563eb;
          }

          .mobile-nav-plus {
            justify-self: center;
            width: 52px;
            height: 52px;
            margin-top: -22px;
            border: none;
            border-radius: 999px;
            background: #2563eb;
            color: #fff;
            font-size: 28px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
          }

          .mobile-nav-shade.is-open {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 58;
            background: rgba(15, 23, 42, 0.35);
          }

          .mobile-nav-sheet.is-open {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            bottom: calc(64px + env(safe-area-inset-bottom));
            z-index: 59;
            padding: 6px 0;
            background: #fff;
            border-radius: 16px 16px 0 0;
          }

          .mobile-nav-sheet a {
            display: block;
            padding: 14px 20px;
            border-top: 1px solid #f1f5f9;
            color: #111827;
            font-size: 15px;
            font-weight: 700;
            text-decoration: none;
          }

          .mobile-nav-sheet a:first-child {
            border-top: none;
          }

          .mobile-nav-form-backdrop {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: flex-end;
            background: rgba(15, 23, 42, 0.45);
          }

          .mobile-nav-form-card {
            width: 100%;
            max-height: 92vh;
            overflow: auto;
            box-sizing: border-box;
            padding: 14px;
            background: #fff;
            border-radius: 18px 18px 0 0;
          }
        }
      `}</style>

      <div
        className={`mobile-nav-shade${showMore ? ' is-open' : ''}`}
        onClick={() => setShowMore(false)}
      />

      <div className={`mobile-nav-sheet${showMore ? ' is-open' : ''}`}>
        <Link href="/categories" onClick={() => setShowMore(false)}>
          Categories
        </Link>
        <Link href="/vendors" onClick={() => setShowMore(false)}>
          Vendors
        </Link>
      </div>

      <nav className="mobile-nav" aria-label="Main">
        <Link
          href="/"
          onClick={() => setShowMore(false)}
          className={`mobile-nav-item${isDashboard ? ' is-active' : ''}`}
        >
          <Icon name="home" />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/transactions"
          onClick={() => setShowMore(false)}
          className={`mobile-nav-item${isTransactions ? ' is-active' : ''}`}
        >
          <Icon name="list" />
          <span>Transactions</span>
        </Link>
        <button type="button" className="mobile-nav-plus" onClick={openForm} aria-label="Add Transaction">
          +
        </button>
        <Link
          href="/wallets"
          onClick={() => setShowMore(false)}
          className={`mobile-nav-item${isWallets ? ' is-active' : ''}`}
        >
          <Icon name="wallet" />
          <span>Wallets</span>
        </Link>
        <button
          type="button"
          className={`mobile-nav-item${isMore || showMore ? ' is-active' : ''}`}
          onClick={() => setShowMore((value) => !value)}
          aria-expanded={showMore}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>

      {showForm && (
        <div className="mobile-nav-form-backdrop" onClick={() => setShowForm(false)}>
          <div className="mobile-nav-form-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Add Transaction</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close transaction form"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '999px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <TransactionForm
              key={formKey}
              initialValues={NEW_TRANSACTION_DEFAULTS}
              onSubmit={handleSave}
              onCancel={() => setShowForm(false)}
              showCancel
              submitLabel="Save Transaction"
            />
          </div>
        </div>
      )}

      <Toast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
    </>
  )
}
