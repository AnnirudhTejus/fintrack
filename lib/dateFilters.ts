export type DatePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_30_days'
  | 'this_year'
  | 'all_time'
  | 'custom';

export type DateRange = {
  from: string;
  to: string;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day; // make Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfYear(date: Date) {
  const d = new Date(date.getFullYear(), 0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfYear(date: Date) {
  const d = new Date(date.getFullYear(), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function buildDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): DateRange {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  switch (preset) {
    case 'today':
      return {
        from: toInputDate(todayStart),
        to: toInputDate(todayEnd),
      };

    case 'this_week':
      return {
        from: toInputDate(startOfWeek(now)),
        to: toInputDate(endOfWeek(now)),
      };

    case 'this_month':
      return {
        from: toInputDate(startOfMonth(now)),
        to: toInputDate(endOfMonth(now)),
      };

    case 'last_30_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return {
        from: toInputDate(startOfDay(from)),
        to: toInputDate(todayEnd),
      };
    }

    case 'this_year':
      return {
        from: toInputDate(startOfYear(now)),
        to: toInputDate(endOfYear(now)),
      };

    case 'custom':
      return {
        from: customFrom || '',
        to: customTo || '',
      };

    case 'all_time':
    default:
      return {
        from: '',
        to: '',
      };
  }
}

export function isDateInRange(
  value: string | Date,
  from?: string,
  to?: string
) {
  const date =
    typeof value === 'string'
      ? startOfDay(parseLocalDate(value.slice(0, 10)))
      : startOfDay(value);

  if (from) {
    const fromDate = startOfDay(parseLocalDate(from));
    if (date < fromDate) return false;
  }

  if (to) {
    const toDate = endOfDay(parseLocalDate(to));
    if (date > toDate) return false;
  }

  return true;
}

export function getPresetLabel(preset: DatePreset) {
  switch (preset) {
    case 'today':
      return 'Today';
    case 'this_week':
      return 'This Week';
    case 'this_month':
      return 'This Month';
    case 'last_30_days':
      return 'Last 30 Days';
    case 'this_year':
      return 'This Year';
    case 'all_time':
      return 'All Time';
    case 'custom':
      return 'Custom';
    default:
      return 'Date Range';
  }
}