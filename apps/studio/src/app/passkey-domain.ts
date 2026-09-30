// Where a passkey can work: WebAuthn binds each passkey to its Relying Party ID, a registrable domain, and the
// browser accepts it only on that domain and its subdomains.

/** True when `host` is the RP ID or one of its subdomains; never for a look-alike ("evilsophia-ei.com"). */
export function passkeysWorkOn(host: string, rpId: string | undefined): boolean {
  if (!rpId) return false
  const h = host.toLowerCase()
  const rp = rpId.toLowerCase()
  return h === rp || h.endsWith(`.${rp}`)
}
