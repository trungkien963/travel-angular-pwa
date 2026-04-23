export function formatCurrency(val: number): string { 
  if (val === null || val === undefined) return '0₫';
  return `${(val || 0).toLocaleString('en-US')}₫`; 
}

export function formatNumber(val: number): string { 
  if (val === null || val === undefined) return '0';
  return (val || 0).toLocaleString('en-US'); 
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr || dateStr === 'Unknown Date') return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function formatRelative(ts: string): string {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (isNaN(diff)) return '';
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch {
    return '';
  }
}
