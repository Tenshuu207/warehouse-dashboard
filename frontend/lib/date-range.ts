export type DateRange = {
  start: string;
  end: string;
};

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(value));
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = toUtcDate(value);
  return !Number.isNaN(parsed.getTime()) && formatIsoDate(parsed) === value;
}

export function addDays(date: string, days: number) {
  if (!isIsoDate(date)) return date;

  const next = toUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDate(next);
}

export function startOfWeek(date: string) {
  return isIsoDate(date) ? date : "";
}

export function endOfWeek(date: string) {
  const start = startOfWeek(date);
  return start ? addDays(start, 6) : "";
}

export function resolveContextRange(
  selectedDate: string,
  searchParams?: { get(name: string): string | null } | null
): DateRange {
  const fallbackStart = startOfWeek(selectedDate);
  const fallbackEnd = fallbackStart ? endOfWeek(fallbackStart) : "";

  const paramStart = searchParams?.get("start") || "";
  const paramEnd = searchParams?.get("end") || "";
  const hasStart = isIsoDate(paramStart);
  const hasEnd = isIsoDate(paramEnd);

  if (hasStart && hasEnd) {
    return {
      start: paramStart,
      end: paramEnd >= paramStart ? paramEnd : endOfWeek(paramStart),
    };
  }

  if (hasStart) {
    return {
      start: paramStart,
      end: endOfWeek(paramStart),
    };
  }

  if (hasEnd) {
    return {
      start: addDays(paramEnd, -6),
      end: paramEnd,
    };
  }

  if (fallbackStart) {
    return {
      start: fallbackStart,
      end: fallbackEnd,
    };
  }

  const today = formatIsoDate(new Date());
  return {
    start: today,
    end: addDays(today, 6),
  };
}

export function rangeLabel(range: DateRange) {
  if (!isIsoDate(range.start) || !isIsoDate(range.end)) return "Unknown range";
  return `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`;
}

export function rangeHref(pathname: string, range: DateRange) {
  const params = new URLSearchParams();
  params.set("start", range.start);
  params.set("end", range.end);
  return `${pathname}?${params.toString()}`;
}
