'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { buildDateRange, isDateInRange, type DatePreset } from '@/lib/dateFilters'
import ConfirmModal from '@/components/ConfirmModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import Toast from '@/components/Toast'
import TransactionForm, {
  TransactionFormInitialValues,
  TransactionFormValues,
  TransactionType,
} from '@/components/TransactionForm'

type PageTransactionType = TransactionType | 'Transfer'
type FilterType = 'All' | PageTransactionType
type PageSizeOption = 25 | 50 | 100

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

type CategoryRow = {
  id: number
  type_id: number
  name: string
  is_archived?: boolean
  is_active?: boolean
  sort_order?: number
}

type VendorRow = {
  id: number
  name: string
  normalized_name?: string
  is_archived?: boolean
}

type WalletRow = {
  id: number
  name: string
  type: 'cash' | 'bank' | 'card' | 'ewallet'
  is_archived?: boolean
}

type DisplayTransaction = {
  id: string
  type: PageTransactionType
  category: string
  category_id: string
  vendor: string | null
  vendor_id: number | null
  wallet_id: number | null
  wallet_name: string | null
  wallet_type?: WalletRow['type']
  transfer_wallet_id: number | null
  transfer_wallet_name: string | null
  transfer_wallet_type?: WalletRow['type']
  amount: number
  date: string
  note: string | null
  title: string
  direction: 'in' | 'out'
}

type CategoryOption = {
  id: string
  name: string
}

type GroupedTransactions = {
  date: string
  label: string
  rows: DisplayTransaction[]
  expenseTotal: number
  incomeTotal: number
  transferTotal: number
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

function formatPrettyDate(dateString: string) {
  const input = new Date(dateString)
  if (Number.isNaN(input.getTime())) return dateString.toUpperCase()

  return input.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase()
}

function formatMonthYearLabel(dateString: string) {
  if (!dateString) return ''
  const input = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(input.getTime())) return dateString
  return input.toLocaleDateString('en-MY', {
    month: 'short',
    year: 'numeric',
  })
}

function formatGroupLabel(dateString: string) {
  const input = new Date(dateString)
  const today = new Date()

  if (Number.isNaN(input.getTime())) return dateString.toUpperCase()

  const inputDay = new Date(input.getFullYear(), input.getMonth(), input.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.floor((todayDay.getTime() - inputDay.getTime()) / 86400000)

  const pretty = formatPrettyDate(dateString)

  if (diffDays === 0) return `Today — ${pretty}`
  if (diffDays === 1) return `Yesterday — ${pretty}`
  return pretty
}

function mapTypeIdToType(typeId: number): TransactionType | null {
  if (typeId === 1) return 'Expense'
  if (typeId === 2) return 'Income'
  if (typeId === 3) return 'Investment'
  return null
}

function getTypeDotColor(type: PageTransactionType) {
  if (type === 'Expense') return '#ef4444'
  if (type === 'Income') return '#65a30d'
  if (type === 'Investment') return '#3b82f6'
  return '#8b5cf6'
}

function getAmountColor(type: PageTransactionType, direction: 'in' | 'out') {
  if (type === 'Transfer') return '#7c3aed'
  if (type === 'Investment') return '#2563eb'
  return direction === 'in' ? '#166534' : '#b91c1c'
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

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
  if (currentPage <= 3) return [1, 2, 3, 4, 5]
  if (currentPage >= totalPages - 2) {
    return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }
  return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2]
}

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function getCsvDirection(item: DisplayTransaction) {
  if (item.type === 'Transfer') return 'Transfer'
  if (item.direction === 'in') return 'In'
  return 'Out'
}

const presetOptions: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
]

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [filterType, setFilterType] = useState<FilterType>('All')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterWalletId, setFilterWalletId] = useState<string>('All')

  const [datePreset, setDatePreset] = useState<DatePreset>('all_time')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formInitialValues, setFormInitialValues] = useState<TransactionFormInitialValues>({
    type: 'Expense',
  })

  const [workingId, setWorkingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(25)

  const fetchData = async () => {
    setLoading(true)

    const [txRes, walletRes, vendorRes, categoryRes] = await Promise.all([
      supabase
        .from('transaction')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('wallets')
        .select('id, name, type, is_archived')
        .order('name', { ascending: true }),
      supabase
        .from('vendors')
        .select('id, name, normalized_name, is_archived')
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, type_id, name, is_archived, is_active, sort_order')
        .order('type_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ])

    if (txRes.error) {
      setErrorMessage(txRes.error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    if (walletRes.error) {
      setErrorMessage(walletRes.error.message)
      setWallets([])
    } else {
      setWallets((walletRes.data as WalletRow[]) || [])
    }

    if (vendorRes.error) {
      setErrorMessage(vendorRes.error.message)
      setVendors([])
    } else {
      setVendors((vendorRes.data as VendorRow[]) || [])
    }

    if (categoryRes.error) {
      setErrorMessage(categoryRes.error.message)
      setCategories([])
    } else {
      setCategories((categoryRes.data as CategoryRow[]) || [])
    }

    setTransactions((txRes.data as TransactionRow[]) || [])
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

  const walletMap = useMemo(() => {
    const map: Record<number, WalletRow> = {}
    wallets.forEach((wallet) => {
      map[wallet.id] = wallet
    })
    return map
  }, [wallets])

  const vendorMap = useMemo(() => {
    const map: Record<number, VendorRow> = {}
    vendors.forEach((vendor) => {
      map[vendor.id] = vendor
    })
    return map
  }, [vendors])

  const categoryMap = useMemo(() => {
    const map: Record<number, CategoryRow> = {}
    categories.forEach((category) => {
      map[category.id] = category
    })
    return map
  }, [categories])

  const displayTransactions = useMemo<DisplayTransaction[]>(() => {
    return transactions.map((item) => {
      const wallet = item.wallet_id ? walletMap[item.wallet_id] : undefined
      const transferWallet = item.transfer_wallet_id ? walletMap[item.transfer_wallet_id] : undefined

      const resolvedVendor =
        (item.vendor_id ? vendorMap[item.vendor_id]?.name : null) || item.vendor || null

      const resolvedCategory =
        (item.category_id ? categoryMap[item.category_id]?.name : '') ||
        item.category ||
        (item.type === 'Transfer' ? 'Transfer' : 'Uncategorized')

      const title =
        item.type === 'Transfer'
          ? `Transfer · ${wallet?.name || 'No wallet'} → ${transferWallet?.name || 'No wallet'}`
          : `${resolvedCategory}${resolvedVendor ? ` · ${resolvedVendor}` : ''}`

      const direction: 'in' | 'out' = item.type === 'Income' ? 'in' : 'out'

      return {
        id: item.id,
        type: item.type,
        category: resolvedCategory,
        category_id: item.category_id ? String(item.category_id) : '',
        vendor: resolvedVendor,
        vendor_id: item.vendor_id,
        wallet_id: item.wallet_id,
        wallet_name: wallet?.name || null,
        wallet_type: wallet?.type,
        transfer_wallet_id: item.transfer_wallet_id,
        transfer_wallet_name: transferWallet?.name || null,
        transfer_wallet_type: transferWallet?.type,
        amount: Number(item.amount) || 0,
        date: item.date,
        note: item.note,
        title,
        direction,
      }
    })
  }, [transactions, walletMap, vendorMap, categoryMap])

  const availableFilterCategories = useMemo<CategoryOption[]>(() => {
    const activeRows = categories.filter(
      (item) => item.is_archived !== true && item.is_active !== false
    )

    if (filterType === 'Transfer') return []

    if (filterType === 'All') {
      return activeRows
        .filter((item) => {
          const mapped = mapTypeIdToType(item.type_id)
          return mapped === 'Expense' || mapped === 'Income' || mapped === 'Investment'
        })
        .map((item) => ({
          id: String(item.id),
          name: item.name,
        }))
    }

    const wantedType =
      filterType === 'Expense' ? 1 : filterType === 'Income' ? 2 : filterType === 'Investment' ? 3 : 0

    return activeRows
      .filter((item) => item.type_id === wantedType)
      .map((item) => ({
        id: String(item.id),
        name: item.name,
      }))
  }, [categories, filterType])

  useEffect(() => {
    if (filterCategoryId === 'All') return
    const exists = availableFilterCategories.some((item) => item.id === filterCategoryId)
    if (!exists) setFilterCategoryId('All')
  }, [availableFilterCategories, filterCategoryId])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    filterType,
    filterCategoryId,
    filterWalletId,
    searchQuery,
    filterDateFrom,
    filterDateTo,
    datePreset,
    pageSize,
  ])

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return displayTransactions.filter((item) => {
      const typeMatch = filterType === 'All' ? true : item.type === filterType

      const categoryMatch =
        filterCategoryId === 'All'
          ? true
          : item.type === 'Transfer'
            ? false
            : item.category_id === filterCategoryId

      const walletMatch =
        filterWalletId === 'All'
          ? true
          : String(item.wallet_id || '') === filterWalletId ||
            String(item.transfer_wallet_id || '') === filterWalletId

      const searchableText = [
        item.title,
        item.category,
        item.vendor || '',
        item.note || '',
        item.wallet_name || '',
        item.transfer_wallet_name || '',
      ]
        .join(' ')
        .toLowerCase()

      const searchMatch = normalizedQuery === '' ? true : searchableText.includes(normalizedQuery)
      const dateMatch = isDateInRange(item.date, filterDateFrom, filterDateTo)

      return typeMatch && categoryMatch && walletMatch && searchMatch && dateMatch
    })
  }, [
    displayTransactions,
    filterType,
    filterCategoryId,
    filterWalletId,
    searchQuery,
    filterDateFrom,
    filterDateTo,
  ])

  const filteredGrandTotal = useMemo(
    () => filteredTransactions.reduce((sum, item) => sum + item.amount, 0),
    [filteredTransactions]
  )

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize))

  const paginatedTransactions = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages)
    const start = (safePage - 1) * pageSize
    return filteredTransactions.slice(start, start + pageSize)
  }, [filteredTransactions, currentPage, totalPages, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const groupedTransactions = useMemo<GroupedTransactions[]>(() => {
    const groups: Record<string, GroupedTransactions> = {}

    paginatedTransactions.forEach((item) => {
      if (!groups[item.date]) {
        groups[item.date] = {
          date: item.date,
          label: formatGroupLabel(item.date),
          rows: [],
          expenseTotal: 0,
          incomeTotal: 0,
          transferTotal: 0,
        }
      }

      groups[item.date].rows.push(item)

      if (item.type === 'Income') {
        groups[item.date].incomeTotal += item.amount
      } else if (item.type === 'Transfer') {
        groups[item.date].transferTotal += item.amount
      } else {
        groups[item.date].expenseTotal += item.amount
      }
    })

    return Object.keys(groups)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => groups[key])
  }, [paginatedTransactions])

  const summaryTone = useMemo(() => {
    if (filterType === 'Income') {
      return {
        background: '#f0fdf4',
        border: '#bbf7d0',
        text: '#166534',
      }
    }
    if (filterType === 'Expense') {
      return {
        background: '#fef2f2',
        border: '#fecaca',
        text: '#b91c1c',
      }
    }
    if (filterType === 'Investment') {
      return {
        background: '#eff6ff',
        border: '#bfdbfe',
        text: '#1d4ed8',
      }
    }
    if (filterType === 'Transfer') {
      return {
        background: '#f5f3ff',
        border: '#ddd6fe',
        text: '#6d28d9',
      }
    }
    return {
      background: '#f8fafc',
      border: '#e5e7eb',
      text: '#0f172a',
    }
  }, [filterType])

  const summaryTitle = useMemo(() => {
    if (filterType === 'Income') return 'Total income'
    if (filterType === 'Expense') return 'Total expense'
    if (filterType === 'Investment') return 'Total investment'
    if (filterType === 'Transfer') return 'Total transfer'
    return 'All transactions'
  }, [filterType])

  const summaryContextParts = useMemo(() => {
    const parts: string[] = []

    if (filterWalletId !== 'All') {
      const wallet = wallets.find((item) => String(item.id) === filterWalletId)
      if (wallet) parts.push(wallet.name)
    }

    if (filterCategoryId !== 'All') {
      const category = availableFilterCategories.find((item) => item.id === filterCategoryId)
      if (category) parts.push(category.name)
    }

    if (datePreset !== 'all_time') {
      if (datePreset === 'today') parts.push('Today')
      else if (datePreset === 'this_week') parts.push('This Week')
      else if (datePreset === 'this_month') parts.push('This Month')
      else if (datePreset === 'last_30_days') parts.push('Last 30 Days')
      else if (datePreset === 'this_year') parts.push('This Year')
      else if (datePreset === 'custom') {
        if (filterDateFrom && filterDateTo) {
          const sameMonth =
            formatMonthYearLabel(filterDateFrom) === formatMonthYearLabel(filterDateTo)
          parts.push(
            sameMonth
              ? formatMonthYearLabel(filterDateFrom)
              : `${formatPrettyDate(filterDateFrom)} to ${formatPrettyDate(filterDateTo)}`
          )
        } else if (filterDateFrom || filterDateTo) {
          parts.push(`${filterDateFrom || '...'} to ${filterDateTo || '...'}`)
        }
      }
    }

    if (searchQuery.trim()) {
      parts.push(`“${searchQuery.trim()}”`)
    }

    return parts
  }, [
    filterWalletId,
    wallets,
    filterCategoryId,
    availableFilterCategories,
    datePreset,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  ])

  const summaryLine = useMemo(() => {
    const countText = `${filteredTransactions.length} ${filteredTransactions.length === 1 ? 'transaction' : 'transactions'}`
    const amountText =
      filterType === 'All'
        ? `${formatCurrency(filteredGrandTotal)} total`
        : formatCurrency(filteredGrandTotal)

    const base = `${summaryTitle} · ${amountText} · ${countText}`

    if (summaryContextParts.length === 0) return base
    return `${base} · ${summaryContextParts.join(' · ')}`
  }, [filteredTransactions.length, filteredGrandTotal, filterType, summaryTitle, summaryContextParts])

  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset)
    const range = buildDateRange(preset, filterDateFrom, filterDateTo)
    setFilterDateFrom(range.from)
    setFilterDateTo(range.to)
  }

  function handleFromDateChange(value: string) {
    setDatePreset('custom')
    setFilterDateFrom(value)
  }

  function handleToDateChange(value: string) {
    setDatePreset('custom')
    setFilterDateTo(value)
  }

  const clearFilters = () => {
    setFilterType('All')
    setFilterCategoryId('All')
    setSearchQuery('')
    setFilterWalletId('All')
    setDatePreset('all_time')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const resetFormState = () => {
    setEditingId(null)
    setFormInitialValues({ type: 'Expense' })
  }

  const handleAddNew = () => {
    resetFormState()
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleEdit = (item: DisplayTransaction) => {
    if (item.type === 'Transfer') {
      setErrorMessage('Transfer editing is disabled for now.')
      return
    }

    setEditingId(item.id)
    setFormInitialValues({
      type: item.type as TransactionType,
      category_id: item.category_id || '',
      vendor: item.vendor || '',
      vendor_id: item.vendor_id || null,
      wallet_id: item.wallet_id || null,
      amount: String(item.amount),
      date: item.date,
      note: item.note || '',
    })
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleCancel = () => {
    resetFormState()
    setShowForm(false)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleSaveTransaction = async (values: TransactionFormValues) => {
    setErrorMessage('')
    setSuccessMessage('')

    if (editingId) {
      const { error } = await supabase.from('transaction').update(values).eq('id', editingId)
      if (error) {
        setErrorMessage(error.message)
        return
      }
      setSuccessMessage('Transaction updated successfully.')
    } else {
      const { error } = await supabase.from('transaction').insert([values])
      if (error) {
        setErrorMessage(error.message)
        return
      }
      setSuccessMessage('Transaction added successfully.')
    }

    resetFormState()
    setShowForm(false)
    await fetchData()
  }

  const handleDelete = async (id: string) => {
    setErrorMessage('')
    setSuccessMessage('')
    setWorkingId(id)

    const { error } = await supabase.from('transaction').delete().eq('id', id)
    setWorkingId(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (editingId === id) {
      resetFormState()
      setShowForm(false)
    }

    setSuccessMessage('Transaction deleted successfully.')
    await fetchData()
  }

  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) {
      setErrorMessage('No transactions available for export.')
      return
    }

    setErrorMessage('')

    const header = [
      'Date',
      'Type',
      'Direction',
      'Category',
      'Vendor',
      'Wallet',
      'Transfer Wallet',
      'Amount',
      'Note',
    ]

    const rows = filteredTransactions.map((item) => [
      item.date,
      item.type,
      getCsvDirection(item),
      item.type === 'Transfer' ? 'Transfer' : item.category,
      item.vendor || '',
      item.wallet_name || '',
      item.transfer_wallet_name || '',
      item.amount.toFixed(2),
      item.note || '',
    ])

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fileDate = new Date().toISOString().slice(0, 10)
    const scopePart = filteredTransactions.length === transactions.length ? 'all' : 'filtered'
    const typePart = filterType === 'All' ? 'transactions' : filterType.toLowerCase()

    link.href = url
    link.download = `fintrack-${typePart}-${scopePart}-${fileDate}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setSuccessMessage('CSV exported successfully.')
  }

  const pageWrap: CSSProperties = {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '48px',
    padding: '0 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
  }

  const buttonSecondary: CSSProperties = {
    height: '48px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  }

  const buttonPrimary: CSSProperties = {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
  }

  const presetButton = (active: boolean): CSSProperties => ({
    height: '42px',
    padding: '0 18px',
    borderRadius: '999px',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#111827',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  })

  const paginationButton = (active: boolean): CSSProperties => ({
    minWidth: '40px',
    height: '40px',
    padding: '0 12px',
    borderRadius: '10px',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#111827',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
  })

  const sectionCard: CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    background: '#fff',
    padding: '16px',
  }

  const visiblePages = getVisiblePages(currentPage, totalPages)
  const pageStart = filteredTransactions.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, filteredTransactions.length)

  return (
    <main style={pageWrap}>
      <style>{`
        .tx-quick-date-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .tx-mobile-actions {
          display: none;
        }

        .tx-mobile-filter-panel {
          display: block;
        }

        .tx-date-inputs {
          display: grid;
          grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr);
          gap: 10px;
          margin-bottom: 10px;
        }

        .tx-filters-grid {
          display: grid;
          grid-template-columns: minmax(150px, 1fr) minmax(170px, 1fr) minmax(170px, 1fr) minmax(220px, 1.2fr) auto;
          gap: 8px;
          align-items: center;
        }

        .tx-context-strip {
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.5;
        }

        .tx-row-grid {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: start;
        }

        .tx-group-grid {
          display: grid;
          grid-template-columns: 14px minmax(0, 1.9fr) minmax(140px, 1fr) 120px auto;
          gap: 12px;
          align-items: center;
        }

        .tx-row {
          position: relative;
        }

        .tx-content-wrap {
          min-width: 0;
        }

        .tx-main-line {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .tx-title-stack {
          min-width: 0;
          flex: 1;
        }

        .tx-amount-wrap {
          text-align: right;
          white-space: nowrap;
          align-self: center;
        }

        .tx-note-line {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          word-break: break-word;
        }

        .tx-menu-col .ram-trigger {
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .tx-row:hover .tx-menu-col .ram-trigger,
        .tx-row:focus-within .tx-menu-col .ram-trigger {
          opacity: 1;
        }

        .tx-pagination-wrap {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .tx-pagination-pages {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tx-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          z-index: 100;
          display: flex;
          align-items: center;
          justifyContent: center;
          padding: 16px;
        }

        .tx-modal-card {
          width: min(760px, 100%);
          max-height: calc(100vh - 32px);
          overflow: auto;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #fff;
          padding: 16px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.18);
        }

        @media (max-width: 1100px) {
          .tx-filters-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) auto !important;
          }
        }

        @media (max-width: 900px) {
          .tx-date-inputs {
            grid-template-columns: 1fr 1fr !important;
          }

          .tx-filters-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .tx-group-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .tx-group-label {
            text-align: left !important;
          }

          .tx-group-spacer {
            display: none !important;
          }

          .tx-group-totals {
            justify-self: start !important;
            text-align: left !important;
            white-space: normal !important;
          }

          .tx-pagination-wrap {
            flex-direction: column;
            align-items: stretch !important;
          }

          .tx-pagination-pages {
            justify-content: center;
          }
        }

        @media (max-width: 640px) {
          .tx-mobile-actions {
            display: flex !important;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 10px;
          }

          .tx-mobile-filter-panel {
            display: none;
          }

          .tx-mobile-filter-panel.is-open {
            display: block;
          }

          .tx-date-inputs {
            grid-template-columns: 1fr !important;
          }

          .tx-filters-grid {
            grid-template-columns: 1fr !important;
          }

          .tx-page-header {
            flex-direction: column;
            align-items: stretch !important;
          }

          .tx-page-actions {
            width: 100%;
          }

          .tx-page-actions button {
            width: 100%;
          }

          .tx-list-header {
            flex-direction: column;
            align-items: flex-start !important;
          }

          .tx-main-line {
            gap: 8px;
          }

          .tx-menu-col .ram-trigger {
            opacity: 1 !important;
          }

          .tx-modal-backdrop {
            align-items: flex-end;
            padding: 0;
          }

          .tx-modal-card {
            width: 100%;
            max-height: 92vh;
            border-radius: 18px 18px 0 0;
            padding: 14px;
          }
        }
      `}</style>

      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/"
          style={{
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div
        className="tx-page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Transactions</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '15px' }}>
            Search, edit, manage, and export your records.
          </p>
        </div>

        <div
          className="tx-page-actions"
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <button type="button" onClick={handleExportCsv} style={buttonSecondary}>
            Export CSV
          </button>
          <button type="button" onClick={handleAddNew} style={buttonPrimary}>
            + Add Transaction
          </button>
        </div>
      </div>

      <section
        style={{
          ...sectionCard,
          marginBottom: '16px',
          padding: '12px',
        }}
      >
        <div className="tx-quick-date-row">
          {presetOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePresetChange(option.value)}
              style={presetButton(datePreset === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="tx-mobile-actions">
          <button
            type="button"
            onClick={() => setShowMobileFilters((prev) => !prev)}
            style={buttonSecondary}
          >
            {showMobileFilters ? 'Hide Filters' : 'Filters'}
          </button>
        </div>

        <div className={`tx-mobile-filter-panel${showMobileFilters ? ' is-open' : ''}`}>
          <div className="tx-date-inputs">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => handleFromDateChange(e.target.value)}
              style={inputStyle}
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => handleToDateChange(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div className="tx-filters-grid">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              style={inputStyle}
            >
              <option value="All">All Types</option>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Investment">Investment</option>
              <option value="Transfer">Transfer</option>
            </select>

            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              style={inputStyle}
              disabled={filterType === 'Transfer'}
            >
              <option value="All">
                {filterType === 'Transfer' ? 'No Category for Transfer' : 'All Categories'}
              </option>
              {availableFilterCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={filterWalletId}
              onChange={(e) => setFilterWalletId(e.target.value)}
              style={inputStyle}
            >
              <option value="All">All Wallets</option>
              {wallets
                .filter((wallet) => wallet.is_archived !== true)
                .map((wallet) => (
                  <option key={wallet.id} value={String(wallet.id)}>
                    {wallet.name}
                  </option>
                ))}
            </select>

            <input
              type="text"
              placeholder="Search vendor, category, note, wallet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={inputStyle}
            />

            <button type="button" onClick={clearFilters} style={buttonSecondary}>
              Clear
            </button>
          </div>
        </div>
      </section>

      <section>
        <div
          className="tx-list-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>All transactions</h2>
          <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
            Showing {pageStart}-{pageEnd} of {filteredTransactions.length}
          </div>
        </div>

        {!loading && filteredTransactions.length > 0 && (
          <div
            className="tx-context-strip"
            style={{
              background: summaryTone.background,
              borderColor: summaryTone.border,
              color: summaryTone.text,
            }}
          >
            <span>{summaryLine}</span>
          </div>
        )}

        {loading ? (
          <div style={sectionCard}>Loading transactions...</div>
        ) : groupedTransactions.length === 0 ? (
          <div style={sectionCard}>No transactions found for these filters.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: '18px' }}>
              {groupedTransactions.map((group) => {
                const totalParts: Array<{ text: string; color: string }> = []

                if (group.expenseTotal > 0) {
                  totalParts.push({
                    text: `${formatCurrencyCompact(group.expenseTotal)} spent`,
                    color: '#b91c1c',
                  })
                }

                if (group.incomeTotal > 0) {
                  totalParts.push({
                    text: `${formatCurrencyCompact(group.incomeTotal)} in`,
                    color: '#166534',
                  })
                }

                if (group.transferTotal > 0) {
                  totalParts.push({
                    text: `${formatCurrencyCompact(group.transferTotal)} transfer`,
                    color: '#7c3aed',
                  })
                }

                return (
                  <div key={group.date}>
                    <div className="tx-group-grid" style={{ padding: '0 16px 8px 16px' }}>
                      <div className="tx-group-spacer" />
                      <div
                        className="tx-group-label"
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          letterSpacing: '0.03em',
                          color: '#111827',
                          textTransform: 'uppercase',
                        }}
                      >
                        {group.label}
                      </div>

                      <div className="tx-group-spacer" />

                      <div
                        className="tx-group-totals"
                        style={{
                          justifySelf: 'end',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {totalParts.map((part, index) => (
                          <span key={`${group.date}-${index}`} style={{ color: part.color }}>
                            {index > 0 && <span style={{ color: '#94a3b8' }}> · </span>}
                            {part.text}
                          </span>
                        ))}
                      </div>

                      <div className="tx-group-spacer" />
                    </div>

                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '14px',
                        background: '#fff',
                      }}
                    >
                      {group.rows.map((item, index) => {
                        const amountColor = getAmountColor(item.type, item.direction)
                        const isWorking = workingId === item.id

                        return (
                          <div
                            key={item.id}
                            className="tx-row tx-row-grid"
                            style={{
                              padding: '12px 16px',
                              borderTop: index === 0 ? 'none' : '1px solid #f1f5f9',
                            }}
                          >
                            <div
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '999px',
                                background: getTypeDotColor(item.type),
                                marginTop: '6px',
                              }}
                            />

                            <div className="tx-content-wrap">
                              <div className="tx-main-line">
                                <div className="tx-title-stack">
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      fontSize: '15px',
                                      color: '#111827',
                                      wordBreak: 'break-word',
                                      lineHeight: 1.25,
                                    }}
                                  >
                                    {item.title}
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
                                        ...getTypeBadgeStyle(item.type),
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '3px 8px',
                                        borderRadius: '999px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {item.type}
                                    </span>

                                    <span
                                      style={{
                                        ...getWalletBadgeStyle(item.wallet_type),
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '3px 8px',
                                        borderRadius: '999px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {item.wallet_name || 'No wallet'}
                                    </span>
                                  </div>

                                  {item.note ? <div className="tx-note-line">{item.note}</div> : null}
                                </div>

                                <div
                                  className="tx-amount-wrap"
                                  style={{
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    color: amountColor,
                                  }}
                                >
                                  {formatCurrency(item.amount)}
                                </div>
                              </div>
                            </div>

                            <div className="tx-menu-col" style={{ justifySelf: 'end' }}>
                              <RowActionsMenu
                                items={[
                                  {
                                    label:
                                      item.type === 'Transfer'
                                        ? 'Edit Disabled for Transfer'
                                        : 'Edit',
                                    disabled: item.type === 'Transfer' || isWorking,
                                    onClick: () => handleEdit(item),
                                  },
                                  {
                                    label: 'Delete',
                                    danger: true,
                                    disabled: isWorking,
                                    onClick: () => setDeleteId(item.id),
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="tx-pagination-wrap">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                    Rows per page
                  </span>

                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value) as PageSizeOption)}
                    style={{
                      ...inputStyle,
                      width: '110px',
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="tx-pagination-pages">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      ...buttonSecondary,
                      opacity: currentPage === 1 ? 0.5 : 1,
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ← Previous
                  </button>

                  {visiblePages[0] > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        style={paginationButton(currentPage === 1)}
                      >
                        1
                      </button>
                      {visiblePages[0] > 2 && (
                        <span style={{ color: '#94a3b8', padding: '0 2px' }}>…</span>
                      )}
                    </>
                  )}

                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      style={paginationButton(currentPage === page)}
                    >
                      {page}
                    </button>
                  ))}

                  {visiblePages[visiblePages.length - 1] < totalPages && (
                    <>
                      {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                        <span style={{ color: '#94a3b8', padding: '0 2px' }}>…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        style={paginationButton(currentPage === totalPages)}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                      ...buttonSecondary,
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {showForm && (
        <div className="tx-modal-backdrop" onClick={handleCancel}>
          <div className="tx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                {editingId ? 'Edit Transaction' : 'Add Transaction'}
              </h2>

              <button
                type="button"
                onClick={handleCancel}
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
              mode={editingId ? 'edit' : 'add'}
              initialValues={formInitialValues}
              submitLabel={editingId ? 'Update Transaction' : 'Save Transaction'}
              onSubmit={handleSaveTransaction}
              onCancel={handleCancel}
              showCancel
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete transaction"
        message="This action cannot be undone."
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) handleDelete(deleteId)
          setDeleteId(null)
        }}
      />

      <Toast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
      <Toast message={errorMessage} type="error" onClose={() => setErrorMessage('')} />
    </main>
  )
}