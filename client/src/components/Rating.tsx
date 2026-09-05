export function Rating({ value, count }: { value: number; count: number }) {
  const full = Math.round(value);
  return (
    <span className="rating">
      <span className="stars" aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      <span>
        {value.toFixed(1).replace('.', ',')} ({count})
      </span>
    </span>
  );
}
