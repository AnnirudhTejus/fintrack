'use client'

// A dropdown with tick boxes, for filters where more than one value can be
// chosen (categories, wallets, vendors). Nothing ticked means "all".
// Laptop: a small panel under the button. Phone: a sheet from the bottom.

import { useEffect, useMemo, useRef, useState } from 'react'

export type MultiSelectOption = { value: string; label: string }

type MultiSelectProps = {
  // Plural name, e.g. "categories"; used in "All categories" and "3 categories".
  noun: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  searchable?: boolean
  disabled?: boolean
  disabledText?: string
}

export default function MultiSelect({
  noun,
  options,
  selected,
  onChange,
  searchable = false,
  disabled = false,
  disabledText,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const labelOf = useMemo(() => {
    const map: Record<string, string> = {}
    options.forEach((option) => {
      map[option.value] = option.label
    })
    return map
  }, [options])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const chosen = selected.filter((value) => labelOf[value])
  const buttonText = disabled
    ? disabledText || `All ${noun}`
    : chosen.length === 0
      ? `All ${noun}`
      : chosen.length <= 2
        ? chosen.map((value) => labelOf[value]).join(', ')
        : `${chosen.length} ${noun}`

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  }

  return (
    <div ref={wrapRef} className="ms-wrap">
      <button
        type="button"
        className={`ms-button${chosen.length > 0 && !disabled ? ' is-active' : ''}`}
        onClick={() => {
          setOpen((value) => !value)
          setQuery('')
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter ${noun}`}
      >
        <span className="ms-button-text">{buttonText}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          <div className="ms-shade" onClick={() => setOpen(false)} />
          <div className="ms-pop" role="listbox" aria-multiselectable="true" aria-label={noun}>
            <div className="ms-pop-head">
              <span className="ms-pop-title">Show {noun}</span>
              <span>
                <button type="button" onClick={() => onChange(options.map((option) => option.value))}>
                  Select all
                </button>
                <span aria-hidden="true"> · </span>
                <button type="button" onClick={() => onChange([])}>
                  Clear
                </button>
              </span>
            </div>

            {searchable && (
              <input
                type="text"
                className="ms-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${noun}`}
                aria-label={`Search ${noun}`}
                autoComplete="off"
              />
            )}

            <div className="ms-list">
              {visible.length === 0 && <div className="ms-empty">Nothing matches.</div>}
              {visible.map((option) => (
                <label key={option.value} className="ms-item">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggle(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <div className="ms-pop-foot">
              <span>{chosen.length === 0 ? `Showing all ${noun}` : `${chosen.length} ticked`}</span>
              <button type="button" className="ms-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
