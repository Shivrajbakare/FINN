export function formatINR(value, decimals = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR",
    minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function closePoints(stock) {
  return (stock?.price_history || []).filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
}

export function chartPath(values, width, height, padding = 2) {
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return "";
  const min = Math.min(...values), max = Math.max(...values);
  return values.map((value, i) => {
    const x = padding + i / (values.length - 1) * (width - 2 * padding);
    const y = max === min ? height / 2 : height - padding - (value - min) / (max - min) * (height - 2 * padding);
    return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
