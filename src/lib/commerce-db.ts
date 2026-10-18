import 'server-only';
export function isCommerceSandbox(): boolean { return process.env.COMMERCE_SANDBOX === 'true'; }
export function commerceTable(name: string): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid commerce table');
  return `${isCommerceSandbox() ? 'preview_' : ''}${name}`;
}
