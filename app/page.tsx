'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TransactionForm, {
  TransactionFormInitialValues,
  TransactionFormValues,
  TransactionType,
} from '@/components/TransactionForm'
import { walletBalance, walletPeriodSummary } from '@/lib/walletBalance'

type PageTransactionType = TransactionType | 'Transfer'
type TimeFilter = 'week' | 'month' | 'year' | 'all_time' | 'custom'

type TransactionRow = {
  id: string
  created_at?: string
  type: PageTransactionType
  category: string | null
  category_id: number | null
  vendor: string | null
  vendor_id: number | null
  wallet_id: number | null
  transfer_wallet_id: number | null
  amount: number
  date: string
  note: string | null
}

type WalletRow = {
  id: number
  name: string
  type: 'cash' | 'bank' | 'card' | 'ewallet'
  is_archived?: boolean
  opening_balance?: number | null
  opening_balance_date?: string | null
}

type CategoryRow = {
  id: number
  name: string
  type_id: number
  is_archived?: boolean
  is_active?: boolean
}

type VendorRow = {
  id: number
  name: string
  is_archived?: boolean
}

type WalletSummaryItem = {
  id: number
  name: string
  type: WalletRow['type']
  current: number
  showBalances: boolean
  opening: number | null
  moneyIn: number
  moneyOut: number
  closing: number | null
}

type DisplayTransaction = {
  id: string
  type: PageTransactionType
  title: string
  amount: number
  date: string
  note: string | null
  walletName: string | null
  walletType?: WalletRow['type']
}

function formatCurrency(value: number) {
  return `RM ${value.toFixed(2)}`
}

function formatCurrencyCompact(value: number) {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

// Same as formatBalance but without the RM prefix, for the small secondary figures.
// A balance that is not known (before the wallet's opening date) shows as a dash.
function formatAmount(value: number | null) {
  if (value === null) return '–'
  const formatted = Math.abs(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}${formatted}`
}

function formatBalance(value: number) {
  const formatted = Math.abs(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}RM ${formatted}`
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString

  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

// The month selector covers this month and the three before it.
// Older periods are reached through the Custom filter; future months are not shown.
const MIN_MONTH_OFFSET = -3
const MAX_MONTH_OFFSET = 0

// The month the dashboard is showing. 0 = this month, -1 = last month.
function getSelectedMonth(monthOffset: number) {
  const today = startOfDay(new Date())
  return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
}

function formatMonthLabel(monthOffset: number) {
  return getSelectedMonth(monthOffset).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })
}

function getDateRange(
  filter: TimeFilter,
  customFrom: string,
  customTo: string,
  monthOffset: number
) {
  const today = startOfDay(new Date())

  if (filter === 'week') {
    const start = addDays(today, -6)
    return { start, end: today }
  }

  if (filter === 'month') {
    const start = getSelectedMonth(monthOffset)
    // This month runs up to today (balance so far). Any other month is the whole month.
    if (monthOffset === 0) return { start, end: today }
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return { start, end }
  }

  if (filter === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return { start, end: today }
  }

  if (filter === 'all_time') {
    return { start: null, end: null }
  }

  const start = customFrom ? startOfDay(new Date(customFrom)) : null
  const end = customTo ? startOfDay(new Date(customTo)) : null
  return { start, end }
}

function getPreviousRange(currentStart: Date | null, currentEnd: Date | null) {
  if (!currentStart || !currentEnd) return { start: null, end: null }

  const dayMs = 86400000
  const diffDays =
    Math.round((startOfDay(currentEnd).getTime() - startOfDay(currentStart).getTime()) / dayMs) + 1

  const previousEnd = addDays(currentStart, -1)
  const previousStart = addDays(previousEnd, -(diffDays - 1))

  return { start: previousStart, end: previousEnd }
}

function dateInRange(dateString: string, start: Date | null, end: Date | null) {
  const value = startOfDay(new Date(dateString))
  if (Number.isNaN(value.getTime())) return false
  if (start && value < start) return false
  if (end && value > end) return false
  return true
}

function getTypeBadgeStyle(type: PageTransactionType): React.CSSProperties {
  if (type === 'Expense') return { background: '#fee2e2', color: '#b91c1c' }
  if (type === 'Income') return { background: '#ecfccb', color: '#4d7c0f' }
  if (type === 'Investment') return { background: '#dbeafe', color: '#1d4ed8' }
  return { background: '#ede9fe', color: '#6d28d9' }
}

function getWalletBadgeStyle(walletType?: WalletRow['type']): React.CSSProperties {
  if (walletType === 'cash') return { background: '#fef3c7', color: '#92400e' }
  if (walletType === 'bank') return { background: '#dbeafe', color: '#1d4ed8' }
  if (walletType === 'card') return { background: '#ffedd5', color: '#c2410c' }
  if (walletType === 'ewallet') return { background: '#dcfce7', color: '#166534' }
  return { background: '#e5e7eb', color: '#4b5563' }
}

function getChangeLabel(current: number, previous: number) {
  const delta = current - previous
  const abs = Math.abs(delta)
  return {
    delta,
    text: `${delta >= 0 ? '+' : '-'}${formatCurrencyCompact(abs)} vs previous period`,
  }
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [formInitialValues, setFormInitialValues] = useState<TransactionFormInitialValues>({
    type: 'Expense',
  })

  const [expandedVendorCategory, setExpandedVendorCategory] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [txRes, walletRes, categoryRes, vendorRes] = await Promise.all([
      supabase
        .from('transaction')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('wallets')
        .select('id, name, type, is_archived, opening_balance, opening_balance_date')
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name, type_id, is_archived, is_active')
        .order('type_id', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('vendors')
        .select('id, name, is_archived')
        .order('name', { ascending: true }),
    ])

    if (txRes.error) {
      setErrorMessage(txRes.error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    if (walletRes.error) setErrorMessage(walletRes.error.message)
    if (categoryRes.error) setErrorMessage(categoryRes.error.message)
    if (vendorRes.error) setErrorMessage(vendorRes.error.message)

    setTransactions((txRes.data as TransactionRow[]) || [])
    setWallets((walletRes.data as WalletRow[]) || [])
    setCategories((categoryRes.data as CategoryRow[]) || [])
    setVendors((vendorRes.data as VendorRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!showForm) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [showForm])

  useEffect(() => {
    const today = startOfDay(new Date())
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    setCustomFrom(toInputDate(monthStart))
    setCustomTo(toInputDate(today))
  }, [])

  const walletMap = useMemo(() => {
    const map: Record<number, WalletRow> = {}
    wallets.forEach((wallet) => {
      map[wallet.id] = wallet
    })
    return map
  }, [wallets])

  const categoryMap = useMemo(() => {
    const map: Record<number, CategoryRow> = {}
    categories.forEach((category) => {
      map[category.id] = category
    })
    return map
  }, [categories])

  const vendorMap = useMemo(() => {
    const map: Record<number, VendorRow> = {}
    vendors.forEach((vendor) => {
      map[vendor.id] = vendor
    })
    return map
  }, [vendors])

  const currentRange = useMemo(
    () => getDateRange(timeFilter, customFrom, customTo, monthOffset),
    [timeFilter, customFrom, customTo, monthOffset]
  )

  const previousRange = useMemo(() => {
    // A whole past or future month is compared with the whole month before it.
    if (timeFilter === 'month' && monthOffset !== 0 && currentRange.start) {
      const start = new Date(currentRange.start.getFullYear(), currentRange.start.getMonth() - 1, 1)
      const end = new Date(currentRange.start.getFullYear(), currentRange.start.getMonth(), 0)
      return { start, end }
    }
    return getPreviousRange(currentRange.start, currentRange.end)
  }, [timeFilter, monthOffset, currentRange.start, currentRange.end])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => dateInRange(tx.date, currentRange.start, currentRange.end))
  }, [transactions, currentRange.start, currentRange.end])

  const previousTransactions = useMemo(() => {
    return transactions.filter((tx) => dateInRange(tx.date, previousRange.start, previousRange.end))
  }, [transactions, previousRange.start, previousRange.end])

  const summaryTotals = useMemo(() => {
    let income = 0
    let expense = 0
    let investment = 0

    filteredTransactions.forEach((tx) => {
      const amount = Number(tx.amount) || 0
      if (tx.type === 'Income') income += amount
      if (tx.type === 'Expense') expense += amount
      if (tx.type === 'Investment') investment += amount
    })

    return {
      income,
      expense,
      investment,
      net: income - expense - investment,
    }
  }, [filteredTransactions])

  const previousTotals = useMemo(() => {
    let income = 0
    let expense = 0
    let investment = 0

    previousTransactions.forEach((tx) => {
      const amount = Number(tx.amount) || 0
      if (tx.type === 'Income') income += amount
      if (tx.type === 'Expense') expense += amount
      if (tx.type === 'Investment') investment += amount
    })

    return {
      income,
      expense,
      investment,
      net: income - expense - investment,
    }
  }, [previousTransactions])

  const walletSummary = useMemo<WalletSummaryItem[]>(() => {
    const from = currentRange.start ? toInputDate(currentRange.start) : null
    const to = currentRange.end ? toInputDate(currentRange.end) : null
    const today = toInputDate(startOfDay(new Date()))

    return wallets
      .filter((wallet) => wallet.is_archived !== true)
      .map((wallet) => {
        const period = walletPeriodSummary(wallet, transactions, from, to)

        return {
          id: wallet.id,
          name: wallet.name,
          type: wallet.type,
          current: walletBalance(wallet, transactions, today),
          // A month always shows Opening and Closing (a dash when not known).
          // Longer filters show them only when the app knows the opening balance.
          showBalances: timeFilter === 'month' || (period.opening !== null && period.closing !== null),
          ...period,
        }
      })
      .sort((a, b) => Math.abs(b.current) - Math.abs(a.current))
  }, [transactions, wallets, currentRange.start, currentRange.end, timeFilter])

  const expenseBreakdown = useMemo(() => {
    const expenseRows = filteredTransactions.filter((tx) => tx.type === 'Expense')
    const totalExpense = expenseRows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)

    const map: Record<string, number> = {}

    expenseRows.forEach((tx) => {
      const categoryName =
        (tx.category_id ? categoryMap[tx.category_id]?.name : '') ||
        tx.category ||
        'Uncategorized'

      map[categoryName] = (map[categoryName] || 0) + (Number(tx.amount) || 0)
    })

    return Object.entries(map)
      .map(([name, total]) => ({
        name,
        total,
        percentage: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredTransactions, categoryMap])

  const topVendorsByExpenseCategory = useMemo(() => {
    const expenseRows = filteredTransactions.filter((tx) => tx.type === 'Expense')

    const categoryVendorMap: Record<
      string,
      {
        category: string
        total: number
        vendors: Record<string, number>
      }
    > = {}

    expenseRows.forEach((tx) => {
      const categoryName =
        (tx.category_id ? categoryMap[tx.category_id]?.name : '') ||
        tx.category ||
        'Uncategorized'

      const vendorName =
        (tx.vendor_id ? vendorMap[tx.vendor_id]?.name : '') ||
        tx.vendor ||
        'Unknown vendor'

      if (!categoryVendorMap[categoryName]) {
        categoryVendorMap[categoryName] = {
          category: categoryName,
          total: 0,
          vendors: {},
        }
      }

      categoryVendorMap[categoryName].total += Number(tx.amount) || 0
      categoryVendorMap[categoryName].vendors[vendorName] =
        (categoryVendorMap[categoryName].vendors[vendorName] || 0) + (Number(tx.amount) || 0)
    })

    return Object.values(categoryVendorMap)
      .map((item) => {
        const vendors = Object.entries(item.vendors)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)

        return {
          category: item.category,
          total: item.total,
          vendorCount: vendors.length,
          topVendor: vendors[0] || null,
          vendors,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [filteredTransactions, categoryMap, vendorMap])

  const recentTransactions = useMemo<DisplayTransaction[]>(() => {
    return filteredTransactions.slice(0, 8).map((tx) => {
      const wallet = tx.wallet_id ? walletMap[tx.wallet_id] : undefined
      const transferWallet = tx.transfer_wallet_id ? walletMap[tx.transfer_wallet_id] : undefined

      const categoryName =
        (tx.category_id ? categoryMap[tx.category_id]?.name : '') ||
        tx.category ||
        (tx.type === 'Transfer' ? 'Transfer' : 'Uncategorized')

      const vendorName =
        (tx.vendor_id ? vendorMap[tx.vendor_id]?.name : '') || tx.vendor || ''

      const title =
        tx.type === 'Transfer'
          ? `Transfer · ${wallet?.name || 'No wallet'} → ${transferWallet?.name || 'No wallet'}`
          : `${categoryName}${vendorName ? ` · ${vendorName}` : ''}`

      return {
        id: tx.id,
        type: tx.type,
        title,
        amount: Number(tx.amount) || 0,
        date: tx.date,
        note: tx.note,
        walletName: wallet?.name || null,
        walletType: wallet?.type,
      }
    })
  }, [filteredTransactions, walletMap, categoryMap, vendorMap])

  const handleSaveTransaction = async (values: TransactionFormValues) => {
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('transaction').insert([values])
    if (error) throw new Error(error.message)

    setSuccessMessage('Transaction added successfully.')
    setShowForm(false)
    setFormInitialValues({ type: 'Expense' })
    await fetchData()
  }

  function clearDashboardDates() {
    const today = startOfDay(new Date())
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    setTimeFilter('month')
    setMonthOffset(0)
    setCustomFrom(toInputDate(monthStart))
    setCustomTo(toInputDate(today))
  }

  const currentLabel = useMemo(() => {
    if (timeFilter === 'week') return 'This Week'
    if (timeFilter === 'month') return formatMonthLabel(monthOffset)
    if (timeFilter === 'year') return 'This Year'
    if (timeFilter === 'all_time') return 'All Time'
    if (customFrom || customTo) {
      return `${customFrom || '...'} → ${customTo || '...'}`
    }
    return 'Custom'
  }, [timeFilter, customFrom, customTo, monthOffset])

  const todayLabel = formatDate(toInputDate(startOfDay(new Date())))

  // A past month leads with that month's closing balance; today's balance moves to a small line.
  const isPastMonth = timeFilter === 'month' && monthOffset < 0
  const pastMonthEndLabel = currentRange.end ? formatDate(toInputDate(currentRange.end)) : ''

  const pageWrap: React.CSSProperties = {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
  }

  const card: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    background: '#fff',
    padding: '16px',
  }

  const navButton: React.CSSProperties = {
    ...card,
    padding: '10px 14px',
    textDecoration: 'none',
    color: '#111827',
    fontWeight: 600,
    display: 'inline-block',
  }

  const summaryCard = (
    label: string,
    value: number,
    changeText: string,
    color: string,
    positiveColorRule?: boolean
  ) => {
    const changeValue = changeText.startsWith('+')
    const changeColor =
      positiveColorRule === undefined
        ? '#64748b'
        : positiveColorRule
          ? changeValue
            ? '#166534'
            : '#b91c1c'
          : changeValue
            ? '#b91c1c'
            : '#166534'

    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '14px',
          background: '#fff',
          padding: '16px',
        }}
      >
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontWeight: 700 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{formatCurrency(value)}</div>
        <div style={{ marginTop: '8px', fontSize: '13px', color: changeColor, fontWeight: 600 }}>
          {changeText}
        </div>
      </div>
    )
  }

  return (
    <main style={pageWrap}>
      <style>{`
        .dashboard-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .dashboard-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .dashboard-time-grid {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .dashboard-custom-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr) auto;
          gap: 10px;
          align-items: center;
        }

        .dashboard-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .dashboard-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .wallet-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 12px;
        }

        .wallet-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 6px 10px;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          color: #111827;
          text-decoration: none;
        }

        .wallet-card:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .wallet-card-title {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          min-width: 0;
        }

        .wallet-card-current {
          font-weight: 800;
          font-size: 17px;
          white-space: nowrap;
          text-align: right;
        }

        .wallet-card-figures {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px 22px;
          font-size: 12px;
          color: #64748b;
        }

        .wallet-card-today {
          grid-column: 1 / -1;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .wallet-card-today b {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .wallet-card-figures > span {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .wallet-card-figures b {
          font-weight: 600;
          color: #334155;
          font-variant-numeric: tabular-nums;
        }

        .recent-tx-row {
          border: 1px solid #f1f5f9;
          border-radius: 10px;
          padding: 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
        }

        .dashboard-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .dashboard-modal-card {
          width: min(760px, 100%);
          max-height: calc(100vh - 32px);
          overflow: auto;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #fff;
          padding: 16px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.18);
        }

        @media (max-width: 900px) {
          .dashboard-main-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .dashboard-topbar {
            flex-direction: column;
            align-items: stretch !important;
          }

          .dashboard-nav {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .dashboard-nav a {
            text-align: center;
            box-sizing: border-box;
          }

          .dashboard-time-grid {
            flex-wrap: wrap !important;
          }

          .dashboard-custom-grid {
            grid-template-columns: 1fr !important;
          }

          .recent-tx-row {
            grid-template-columns: 1fr !important;
          }

          .wallet-card-grid {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .wallet-card {
            border: none;
            border-top: 1px solid #f1f5f9;
            border-radius: 0;
            padding: 12px 4px;
          }

          .wallet-card:first-child {
            border-top: none;
          }

          .wallet-card-current {
            font-size: 15px;
          }

          .recent-tx-value {
            justify-self: start !important;
            text-align: left !important;
          }

          .dashboard-modal-backdrop {
            align-items: flex-end;
            padding: 0;
          }

          .dashboard-modal-card {
            width: 100%;
            max-height: 92vh;
            border-radius: 18px 18px 0 0;
            padding: 14px;
          }
        }

        @media (max-width: 480px) {
          .dashboard-nav,
          .dashboard-custom-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="dashboard-topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>FinTrack</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '15px' }}>
            Showing: {currentLabel}
          </p>
        </div>

        <div className="dashboard-nav">
          <Link href="/transactions" style={navButton}>
            Transactions
          </Link>
          <Link href="/wallets" style={navButton}>
            Wallets
          </Link>
          <Link href="/categories" style={navButton}>
            Categories
          </Link>
          <Link href="/vendors" style={navButton}>
            Vendors
          </Link>
        </div>
      </div>

      <section style={{ ...card, marginBottom: '16px', padding: '14px' }}>
        <div className="dashboard-time-grid">
          {(['week', 'month', 'year', 'all_time', 'custom'] as TimeFilter[]).map((item) => {
            const active = timeFilter === item

            if (item === 'month') {
              const canGoBack = monthOffset > MIN_MONTH_OFFSET
              const canGoForward = monthOffset < MAX_MONTH_OFFSET
              const arrowStyle = (enabled: boolean): React.CSSProperties => ({
                padding: '10px 12px',
                border: 'none',
                background: 'transparent',
                color: active ? '#fff' : '#111827',
                opacity: enabled ? 1 : 0.35,
                fontWeight: 700,
                fontSize: '16px',
                lineHeight: 1,
                cursor: enabled ? 'pointer' : 'not-allowed',
              })

              return (
                <div
                  key={item}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '999px',
                    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
                    background: active ? '#2563eb' : '#fff',
                  }}
                >
                  <button
                    type="button"
                    aria-label="Previous month"
                    title={canGoBack ? 'Previous month' : 'Use Custom for older months'}
                    disabled={!canGoBack}
                    onClick={() => {
                      setTimeFilter('month')
                      setMonthOffset((value) => Math.max(MIN_MONTH_OFFSET, value - 1))
                    }}
                    style={arrowStyle(canGoBack)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeFilter('month')}
                    style={{
                      padding: '10px 4px',
                      border: 'none',
                      background: 'transparent',
                      color: active ? '#fff' : '#111827',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      minWidth: '118px',
                      textAlign: 'center',
                    }}
                  >
                    {formatMonthLabel(monthOffset)}
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    disabled={!canGoForward}
                    onClick={() => {
                      setTimeFilter('month')
                      setMonthOffset((value) => Math.min(MAX_MONTH_OFFSET, value + 1))
                    }}
                    style={arrowStyle(canGoForward)}
                  >
                    ›
                  </button>
                </div>
              )
            }

            return (
              <button
                key={item}
                type="button"
                onClick={() => setTimeFilter(item)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '999px',
                  border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
                  background: active ? '#2563eb' : '#fff',
                  color: active ? '#fff' : '#111827',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {item === 'week'
                  ? 'This Week'
                  : item === 'year'
                    ? 'This Year'
                    : item === 'all_time'
                      ? 'All Time'
                      : 'Custom'}
              </button>
            )
          })}
        </div>

        {timeFilter === 'custom' && (
          <div className="dashboard-custom-grid">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                height: '48px',
                borderRadius: '10px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                height: '48px',
                borderRadius: '10px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={clearDashboardDates}
              style={{
                height: '48px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#111827',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            >
              Clear
            </button>
          </div>
        )}
      </section>

      {errorMessage && (
        <p style={{ color: '#b91c1c', marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>
          {errorMessage}
        </p>
      )}

      {successMessage && (
        <p style={{ color: '#166534', marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>
          {successMessage}
        </p>
      )}

      <section className="dashboard-summary-grid">
        {summaryCard(
          'Income',
          summaryTotals.income,
          getChangeLabel(summaryTotals.income, previousTotals.income).text,
          '#166534',
          true
        )}
        {summaryCard(
          'Expenses',
          summaryTotals.expense,
          getChangeLabel(summaryTotals.expense, previousTotals.expense).text,
          '#b91c1c',
          false
        )}
        {summaryCard(
          'Investments',
          summaryTotals.investment,
          getChangeLabel(summaryTotals.investment, previousTotals.investment).text,
          '#2563eb',
          false
        )}
        {summaryCard(
          'Net Balance',
          summaryTotals.net,
          getChangeLabel(summaryTotals.net, previousTotals.net).text,
          summaryTotals.net >= 0 ? '#166534' : '#b91c1c',
          true
        )}
      </section>

      <section style={{ ...card, marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Wallet Summary</h2>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            {isPastMonth
              ? `${currentLabel} · balance at end of ${pastMonthEndLabel}`
              : `${currentLabel} · current balance as on ${todayLabel}`}
          </span>
        </div>

        {walletSummary.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>No wallets found.</div>
        ) : (
          <div className="wallet-card-grid">
            {walletSummary.map((wallet) => (
              <Link key={wallet.id} href={`/wallets/${wallet.id}`} className="wallet-card">
                <span className="wallet-card-title">
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{wallet.name}</span>
                  <span
                    style={{
                      ...getWalletBadgeStyle(wallet.type),
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {wallet.type}
                  </span>
                </span>

                {isPastMonth ? (
                  <span className="wallet-card-current" style={{ color: '#334155' }}>
                    {wallet.closing === null ? '–' : formatBalance(wallet.closing)}
                  </span>
                ) : (
                  <span
                    className="wallet-card-current"
                    style={{ color: wallet.current >= 0 ? '#166534' : '#b91c1c' }}
                  >
                    {formatBalance(wallet.current)}
                  </span>
                )}

                <span className="wallet-card-figures">
                  {wallet.showBalances && (
                    <span>
                      Opening <b>{formatAmount(wallet.opening)}</b>
                    </span>
                  )}
                  <span style={{ color: '#166534' }}>
                    In <b style={{ color: '#166534' }}>{formatAmount(wallet.moneyIn)}</b>
                  </span>
                  {wallet.showBalances && (
                    <span>
                      Closing <b>{formatAmount(wallet.closing)}</b>
                    </span>
                  )}
                  <span style={{ color: '#b91c1c' }}>
                    Out <b style={{ color: '#b91c1c' }}>{formatAmount(wallet.moneyOut)}</b>
                  </span>
                </span>

                {isPastMonth && (
                  <span className="wallet-card-today">
                    <span>Today, {todayLabel}</span>
                    <b style={{ color: wallet.current >= 0 ? '#166534' : '#b91c1c' }}>
                      {formatBalance(wallet.current)}
                    </b>
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-main-grid">
        <div style={card}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.2rem' }}>
            Expense Breakdown
          </h2>

          {expenseBreakdown.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px' }}>No expense data in this period.</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {expenseBreakdown.map((item) => (
                <div key={item.name}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                      marginBottom: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{item.name}</span>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: '10px',
                      borderRadius: '999px',
                      background: '#f1f5f9',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(item.percentage, 100)}%`,
                        height: '100%',
                        background: '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.2rem' }}>
            Top Vendors by Expense Category
          </h2>

          {topVendorsByExpenseCategory.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px' }}>
              No expense vendor data in this period.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {topVendorsByExpenseCategory.map((group) => {
                const expanded = expandedVendorCategory === group.category
                return (
                  <div
                    key={group.category}
                    style={{
                      border: '1px solid #f1f5f9',
                      borderRadius: '10px',
                      padding: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                        alignItems: 'flex-start',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{group.category}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          {formatCurrency(group.total)} · {group.vendorCount} vendor
                          {group.vendorCount === 1 ? '' : 's'}
                        </div>
                      </div>

                      {group.topVendor && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Top vendor</div>
                          <div style={{ fontWeight: 700, fontSize: '13px' }}>
                            {group.topVendor.name}
                          </div>
                        </div>
                      )}
                    </div>

                    {group.vendors.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVendorCategory(expanded ? null : group.category)
                        }
                        style={{
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          color: '#2563eb',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {expanded ? 'Hide vendors' : 'View vendors'}
                      </button>
                    )}

                    {expanded && (
                      <div style={{ display: 'grid', gap: '6px', marginTop: '10px' }}>
                        {group.vendors.map((vendor) => (
                          <div
                            key={`${group.category}-${vendor.name}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '10px',
                              fontSize: '13px',
                              color: '#334155',
                            }}
                          >
                            <span>{vendor.name}</span>
                            <span style={{ fontWeight: 700 }}>{formatCurrency(vendor.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Recent Transactions</h2>
          <Link
            href="/transactions"
            style={{
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>Loading transactions...</div>
        ) : recentTransactions.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>No transactions in this period.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="recent-tx-row">
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: '#111827',
                      wordBreak: 'break-word',
                    }}
                  >
                    {tx.title}
                  </div>

                  <div
                    style={{
                      marginTop: '6px',
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        ...getTypeBadgeStyle(tx.type),
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {tx.type}
                    </span>

                    <span
                      style={{
                        ...getWalletBadgeStyle(tx.walletType),
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {tx.walletName || 'No wallet'}
                    </span>

                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {formatDate(tx.date)}
                    </span>
                  </div>

                  {tx.note && (
                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
                      {tx.note}
                    </div>
                  )}
                </div>

                <div
                  className="recent-tx-value"
                  style={{
                    fontWeight: 800,
                    fontSize: '14px',
                    color:
                      tx.type === 'Income'
                        ? '#166534'
                        : tx.type === 'Transfer'
                          ? '#7c3aed'
                          : tx.type === 'Investment'
                            ? '#2563eb'
                            : '#b91c1c',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="dashboard-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="dashboard-modal-card" onClick={(e) => e.stopPropagation()}>
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
                aria-label="Close transaction form"
              >
                ×
              </button>
            </div>

            <TransactionForm
              initialValues={formInitialValues}
              onSubmit={handleSaveTransaction}
              onCancel={() => setShowForm(false)}
              showCancel
              submitLabel="Save Transaction"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowForm(true)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '999px',
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          fontSize: '28px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 10px 24px rgba(37,99,235,0.28)',
          zIndex: 50,
        }}
        aria-label="Add Transaction"
      >
        +
      </button>
    </main>
  )
}