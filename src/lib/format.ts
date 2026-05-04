// Format a number using the German-Austria locale with two decimals.
export const fmt = (n: number): string =>
  n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
