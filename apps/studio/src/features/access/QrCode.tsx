// The room link as a QR code: dark modules on a light card with the standard quiet border, the one form
// every phone camera reads. The card is the only light surface in the Studio, and it is there to be scanned.
import { encode } from 'uqr'
import { qrPath } from './access-view.ts'

const BORDER = 4

export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, data } = encode(value, { ecc: 'M', border: 0 })
  const side = size + BORDER * 2
  return (
    <figure className="qr">
      <svg viewBox={`0 0 ${side} ${side}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect width={side} height={side} rx={2} fill="#f4f0ff" />
        <path d={qrPath(data, BORDER)} fill="#050408" />
      </svg>
    </figure>
  )
}
