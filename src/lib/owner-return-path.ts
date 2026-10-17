/** Only same-site, human-facing commerce paths may follow owner sign-in. */
export function ownerReturnPath(value: string | null): string {
  if(!value || value.length>4096 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/admin';
  try {
    const url=new URL(value,'https://commerce.invalid');
    if(url.origin!=='https://commerce.invalid') return '/admin';
    if(!/^\/(?:admin|christmas|store|products|cart|checkout|orders|order-confirmation|qa)(?:\/|$)/.test(url.pathname)) return '/admin';
    if(/^\/admin\/login\/?$/.test(url.pathname)) return '/admin';
    return url.pathname+url.search;
  } catch { return '/admin'; }
}
