const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const decimal = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

export function formatPrice(value: number): string {
  return currency.format(value);
}

export function formatNumber(value: number): string {
  return decimal.format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${decimal.format(hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours % 24);
  return rest > 0 ? `${days} d ${rest} h` : `${days} d`;
}
