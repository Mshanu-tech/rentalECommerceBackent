import dns from 'dns/promises';

const NO_RECORDS = new Set(['ENOTFOUND', 'ENODATA']);

function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), ms)),
  ]);
}

/**
 * Cheap "is this a real mailbox domain?" check run at sign-up, before an OTP is sent.
 * It rejects addresses like someone@no-such-domain.xyz. It can't prove the *mailbox* exists —
 * only the OTP does that — and it never blocks on DNS trouble (timeouts, resolver errors),
 * only on a definitive "this domain has no mail servers / doesn't exist".
 */
export async function domainCanReceiveMail(email) {
  const domain = String(email).split('@')[1];
  if (!domain) return false;

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length) return true;
  } catch (err) {
    if (!NO_RECORDS.has(err.code)) return true;
  }

  // RFC 5321: a domain with no MX falls back to its A record.
  try {
    const a = await withTimeout(dns.resolve4(domain));
    return a.length > 0;
  } catch (err) {
    return !NO_RECORDS.has(err.code);
  }
}
