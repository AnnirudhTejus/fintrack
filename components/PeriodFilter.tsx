'use client'

import { useEffect, useRef } from 'react'
import { buildDateRange, toInputDate } from '@/lib/dateFilters'

// The period buttons shared by the Dashboard and Transactions pages:
// This Week · ‹ Month › · This Year · All Time · Custom
//
// On phones the buttons sit in one row you swipe sideways ('swipe'), or in two
// even rows ('wrap'). Laptops always show one ordinary row.

export type Period = 'week' | 'month' | 'year' | 'all_time' | 'custom'

// The month selector covers this month and the three before it.
// Older periods are reached through Custom; future months are not shown.
export const MIN_MONTH_OFFSET = -3
export const MAX_MONTH_OFFSET = 0

const PHONE_LAYOUT: 'swipe' | 'wrap' = 'swipe'

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

// First day of the month being shown. 0 = this month, -1 = last month.
export function getSelectedMonth(monthOffset: number) {
  const today = startOfToday()
  return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
}

export function formatMonthLabel(monthOffset: number) {
  return getSelectedMonth(monthOffset).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })
}

// Start of the current week, Monday first.
export function getWeekStart() {
  const today = startOfToday()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff)
}

// From/to dates (YYYY-MM-DD, blank = open-ended) for a period button.
// A month runs the whole month. Custom keeps whatever dates are typed in.
export function rangeForPeriod(period: Period, monthOffset: number, from = '', to = '') {
  if (period === 'week') return buildDateRange('this_week')
  if (period === 'year') return buildDateRange('this_year')
  if (period === 'all_time') return { from: '', to: '' }
  if (period === 'custom') return { from, to }
  const start = getSelectedMonth(monthOffset)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return { from: toInputDate(start), to: toInputDate(end) }
}

type PeriodFilterProps = {
  period: Period
  monthOffset: number
  onPeriodChange: (period: Period) => void
  onMonthOffsetChange: (monthOffset: number) => void
}

export default function PeriodFilter({
  period,
  monthOffset,
  onPeriodChange,
  onMonthOffsetChange,
}: PeriodFilterProps) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const monthActive = period === 'month'

  // In the swipe layout the selected button can be off the edge of the screen
  // (for example All Time). Scroll the row so it is always visible.
  useEffect(() => {
    const row = rowRef.current
    if (!row || row.scrollWidth <= row.clientWidth) return
    const active = row.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return
    const left = active.offsetLeft - row.offsetLeft
    const right = left + active.offsetWidth
    if (left < row.scrollLeft) row.scrollLeft = left - 8
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + 8
  }, [period])
  const canGoBack = monthOffset > MIN_MONTH_OFFSET
  const canGoForward = monthOffset < MAX_MONTH_OFFSET

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '9px 14px',
    borderRadius: '999px',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#111827',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  const arrow = (enabled: boolean): React.CSSProperties => ({
    padding: '9px 12px',
    border: 'none',
    background: 'transparent',
    color: monthActive ? '#fff' : '#111827',
    opacity: enabled ? 1 : 0.35,
    fontWeight: 700,
    fontSize: '16px',
    lineHeight: 1,
    cursor: enabled ? 'pointer' : 'not-allowed',
  })

  return (
    <>
      <style>{`
        .period-filter {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .period-filter-month {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 999px;
        }

        @media (max-width: 640px) {
          .period-filter.is-swipe {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          .period-filter.is-swipe::-webkit-scrollbar {
            display: none;
          }

          .period-filter.is-swipe > * {
            flex: none;
          }

          .period-filter.is-wrap {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .period-filter.is-wrap .period-filter-month {
            grid-column: span 2;
          }

          .period-filter.is-wrap > button {
            padding-left: 6px !important;
            padding-right: 6px !important;
          }
        }
      `}</style>

      <div ref={rowRef} className={`period-filter is-${PHONE_LAYOUT}`}>
        <button
          type="button"
          data-active={period === 'week'}
          onClick={() => onPeriodChange('week')}
          style={pill(period === 'week')}
        >
          This Week
        </button>

        <div
          className="period-filter-month"
          data-active={monthActive}
          style={{
            border: monthActive ? '1px solid #2563eb' : '1px solid #d1d5db',
            background: monthActive ? '#2563eb' : '#fff',
          }}
        >
          <button
            type="button"
            aria-label="Previous month"
            title={canGoBack ? 'Previous month' : 'Use Custom for older months'}
            disabled={!canGoBack}
            onClick={() => {
              onPeriodChange('month')
              onMonthOffsetChange(Math.max(MIN_MONTH_OFFSET, monthOffset - 1))
            }}
            style={arrow(canGoBack)}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('month')}
            style={{
              padding: '9px 2px',
              border: 'none',
              background: 'transparent',
              color: monthActive ? '#fff' : '#111827',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {formatMonthLabel(monthOffset)}
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canGoForward}
            onClick={() => {
              onPeriodChange('month')
              onMonthOffsetChange(Math.min(MAX_MONTH_OFFSET, monthOffset + 1))
            }}
            style={arrow(canGoForward)}
          >
            ›
          </button>
        </div>

        <button
          type="button"
          data-active={period === 'year'}
          onClick={() => onPeriodChange('year')}
          style={pill(period === 'year')}
        >
          This Year
        </button>
        <button
          type="button"
          data-active={period === 'all_time'}
          onClick={() => onPeriodChange('all_time')}
          style={pill(period === 'all_time')}
        >
          All Time
        </button>
        <button
          type="button"
          data-active={period === 'custom'}
          onClick={() => onPeriodChange('custom')}
          style={pill(period === 'custom')}
        >
          Custom
        </button>
      </div>
    </>
  )
}
