export function backendUrl(
  name: 'AGENTIC_BASE_URL' | 'ASSISTANT_BASE_URL' | 'ORGANIZER_BASE_URL',
) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value.replace(/\/+$/, '');
}
