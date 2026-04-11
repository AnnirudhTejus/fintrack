'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

export type TransactionType = 'Expense' | 'Income' | 'Investment'

type FormTransactionType = TransactionType | 'Transfer'

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
  normalized_name?: string | null
  is_archived?: boolean
}

type WalletRow = {
  id: number
  name: string
  type: 'cash' | 'bank' | 'card' | 'ewallet'
  is_archived?: boolean
}

export type TransactionFormInitialValues = {
  type?: FormTransactionType
  category_id?: string
  vendor?: string
  vendor_id?: number | null
  wallet_id?: number | null
  transfer_wallet_id?: number | null
  amount?: string
  date?: string
  note?: string
}

export type TransactionFormValues = {
  type: FormTransactionType
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

type TransactionFormProps = {
  mode?: 'add' | 'edit'
  initialValues?: TransactionFormInitialValues
  submitLabel?: string
  showCancel?: boolean
  onCancel?: () => void
  onSubmit: (values: TransactionFormValues) => Promise<void> | void
}

function typeIdToLabel(typeId: number): TransactionType | null {
  if (typeId === 1) return 'Expense'
  if (typeId === 2) return 'Income'
  if (typeId === 3) return 'Investment'
  return null
}

function normalizeVendorName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function todayInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function TransactionForm({
  mode = 'add',
  initialValues,
  submitLabel = 'Save Transaction',
  showCancel = false,
  onCancel,
  onSubmit,
}: TransactionFormProps) {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<FormTransactionType>(initialValues?.type || 'Expense')
  const [categoryId, setCategoryId] = useState(initialValues?.category_id || '')
  const [vendorInput, setVendorInput] = useState(initialValues?.vendor || '')
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(
    initialValues?.vendor_id ?? null
  )
  const [walletId, setWalletId] = useState<string>(
    initialValues?.wallet_id ? String(initialValues.wallet_id) : ''
  )
  const [transferWalletId, setTransferWalletId] = useState<string>(
    initialValues?.transfer_wallet_id ? String(initialValues.transfer_wallet_id) : ''
  )
  const [amount, setAmount] = useState(initialValues?.amount || '')
  const [date, setDate] = useState(initialValues?.date || todayInputValue())
  const [note, setNote] = useState(initialValues?.note || '')

  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const today = todayInputValue()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      const [categoryRes, vendorRes, walletRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, type_id, is_archived, is_active')
          .order('type_id', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('vendors')
          .select('id, name, normalized_name, is_archived')
          .order('name', { ascending: true }),
        supabase
          .from('wallets')
          .select('id, name, type, is_archived')
          .order('name', { ascending: true }),
      ])

      if (!categoryRes.error) setCategories((categoryRes.data as CategoryRow[]) || [])
      if (!vendorRes.error) setVendors((vendorRes.data as VendorRow[]) || [])
      if (!walletRes.error) setWallets((walletRes.data as WalletRow[]) || [])

      setLoading(false)
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (mode === 'edit') return

    if (type === 'Transfer') {
      setCategoryId('')
      setSelectedVendorId(null)
      setVendorInput('')
      return
    }

    const typeCategories = categories.filter((category) => {
      if (category.is_archived === true) return false
      if (category.is_active === false) return false
      return typeIdToLabel(category.type_id) === type
    })

    if (categoryId) {
      const currentExists = typeCategories.some((category) => String(category.id) === categoryId)
      if (!currentExists) setCategoryId('')
    }
  }, [type, categories, categoryId, mode])

  useEffect(() => {
    setType(initialValues?.type || 'Expense')
    setCategoryId(initialValues?.category_id || '')
    setVendorInput(initialValues?.vendor || '')
    setSelectedVendorId(initialValues?.vendor_id ?? null)
    setWalletId(initialValues?.wallet_id ? String(initialValues.wallet_id) : '')
    setTransferWalletId(initialValues?.transfer_wallet_id ? String(initialValues.transfer_wallet_id) : '')
    setAmount(initialValues?.amount || '')
    setDate(initialValues?.date || todayInputValue())
    setNote(initialValues?.note || '')
  }, [initialValues])

  const activeWallets = useMemo(() => {
    return wallets.filter((wallet) => wallet.is_archived !== true)
  }, [wallets])

  const categoryOptions = useMemo(() => {
    if (type === 'Transfer') return []

    return categories.filter((category) => {
      if (category.is_archived === true) return false
      if (category.is_active === false) return false
      return typeIdToLabel(category.type_id) === type
    })
  }, [categories, type])

  const vendorSuggestions = useMemo(() => {
    const query = vendorInput.trim().toLowerCase()
    if (!query) return []

    return vendors
      .filter((vendor) => vendor.is_archived !== true)
      .filter((vendor) => vendor.name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [vendors, vendorInput])

  const isTransfer = type === 'Transfer'
  const isEditMode = mode === 'edit'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Amount must be greater than 0.')
      return
    }

    if (!date) {
      setErrorMessage('Date is required.')
      return
    }

    if (date > today) {
      setErrorMessage('Future dates are not allowed.')
      return
    }

    if (!walletId) {
      setErrorMessage('Wallet is required.')
      return
    }

    if (isTransfer) {
      if (!transferWalletId) {
        setErrorMessage('Transfer wallet is required.')
        return
      }

      if (walletId === transferWalletId) {
        setErrorMessage('Source and destination wallet cannot be the same.')
        return
      }
    } else {
      if (!categoryId) {
        setErrorMessage('Category is required.')
        return
      }
    }

    const trimmedVendor = vendorInput.trim()
    const trimmedNote = note.trim()

    let vendorIdToUse: number | null = selectedVendorId
    let vendorTextToUse: string | null = trimmedVendor || null

    if (!isTransfer && trimmedVendor) {
      const normalized = normalizeVendorName(trimmedVendor)
      const existingVendor = vendors.find(
        (vendor) =>
          vendor.is_archived !== true &&
          (vendor.normalized_name || normalizeVendorName(vendor.name)) === normalized
      )

      if (existingVendor) {
        vendorIdToUse = existingVendor.id
        vendorTextToUse = existingVendor.name
      }
    }

    const selectedCategory =
      !isTransfer && categoryId
        ? categories.find((category) => String(category.id) === categoryId)
        : null

    const payload: TransactionFormValues = {
      type,
      category: isTransfer ? null : selectedCategory?.name || null,
      category_id: isTransfer ? null : Number(categoryId),
      vendor: isTransfer ? null : vendorTextToUse,
      vendor_id: isTransfer ? null : vendorIdToUse,
      wallet_id: Number(walletId),
      transfer_wallet_id: isTransfer ? Number(transferWalletId) : null,
      amount: parsedAmount,
      date,
      note: trimmedNote || null,
    }

    try {
      setSaving(true)
      await onSubmit(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save transaction.'
      setErrorMessage(message)
    } finally {
      setSaving(false)
    }
  }

  const formGrid: CSSProperties = {
    display: 'grid',
    gap: '14px',
  }

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#374151',
    marginBottom: '6px',
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

  const textAreaStyle: CSSProperties = {
    width: '100%',
    minHeight: '92px',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  }

  const rowTwo: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  }

  const rowThree: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  }

  return (
    <form onSubmit={handleSubmit} style={formGrid}>
      <style>{`
        .transaction-form-vendor-suggestions {
          margin-top: 6px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
        }

        .transaction-form-vendor-item {
          width: 100%;
          padding: 10px 12px;
          border: none;
          border-top: 1px solid #f1f5f9;
          background: #fff;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        }

        .transaction-form-vendor-item:first-child {
          border-top: none;
        }

        .transaction-form-vendor-item:hover {
          background: #f8fafc;
        }

        @media (max-width: 640px) {
          .transaction-form-row-two,
          .transaction-form-row-three {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {errorMessage && (
        <div style={{ color: '#b91c1c', fontSize: '14px', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px' }}>Loading form options...</div>
      ) : (
        <>
          {!isEditMode && (
            <div>
              <label style={labelStyle}>Transaction Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormTransactionType)}
                style={inputStyle}
              >
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
                <option value="Investment">Investment</option>
                <option value="Transfer">Transfer</option>
              </select>
            </div>
          )}

          {!isTransfer ? (
            <div className="transaction-form-row-two" style={rowTwo}>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Vendor</label>
                <input
                  type="text"
                  value={vendorInput}
                  onChange={(e) => {
                    setVendorInput(e.target.value)
                    setSelectedVendorId(null)
                  }}
                  placeholder="Vendor name"
                  style={inputStyle}
                />

                {vendorSuggestions.length > 0 && (
                  <div className="transaction-form-vendor-suggestions">
                    {vendorSuggestions.map((vendor) => (
                      <button
                        key={vendor.id}
                        type="button"
                        className="transaction-form-vendor-item"
                        onClick={() => {
                          setVendorInput(vendor.name)
                          setSelectedVendorId(vendor.id)
                        }}
                      >
                        {vendor.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="transaction-form-row-two" style={rowTwo}>
              <div>
                <label style={labelStyle}>From Wallet</label>
                <select
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select source wallet</option>
                  {activeWallets.map((wallet) => (
                    <option key={wallet.id} value={String(wallet.id)}>
                      {wallet.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>To Wallet</label>
                <select
                  value={transferWalletId}
                  onChange={(e) => setTransferWalletId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select destination wallet</option>
                  {activeWallets
                    .filter((wallet) => String(wallet.id) !== walletId)
                    .map((wallet) => (
                      <option key={wallet.id} value={String(wallet.id)}>
                        {wallet.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {!isTransfer && (
            <div>
              <label style={labelStyle}>Wallet</label>
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select wallet</option>
                {activeWallets.map((wallet) => (
                  <option key={wallet.id} value={String(wallet.id)}>
                    {wallet.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="transaction-form-row-three" style={rowThree}>
            <div>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              style={textAreaStyle}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {showCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  height: '44px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#111827',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                height: '44px',
                padding: '0 16px',
                borderRadius: '10px',
                border: '1px solid #0f172a',
                background: '#0f172a',
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </>
      )}
    </form>
  )
}