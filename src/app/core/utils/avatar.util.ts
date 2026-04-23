export function getAvatarBg(name: string): string {
  if (!name) return '#F3F4F6';
  const colors = ['#FEE2E2', '#FFEDD5', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#E0E7FF', '#EDE9FE', '#FCE7F3'];
  return colors[name.charCodeAt(0) % colors.length];
}

export function getAvatarColor(name: string): string {
  if (!name) return '#6B7280';
  const colors = ['#DC2626', '#EA580C', '#D97706', '#059669', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777'];
  return colors[name.charCodeAt(0) % colors.length];
}
