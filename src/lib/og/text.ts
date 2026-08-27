/**
 * @vercel/og / Satori ships a Latin-subset font. Phonetic subscripts,
 * superscript plus/minus, and dotted combining marks render as tofu.
 * Map those to ASCII so formula lines stay readable on the PNG.
 */
const SUBSCRIPT_LETTER: Record<string, string> = {
  'ₐ': 'a',
  'ₑ': 'e',
  'ₕ': 'h',
  'ᵢ': 'i',
  'ⱼ': 'j',
  'ₖ': 'k',
  'ₗ': 'l',
  'ₘ': 'm',
  'ₙ': 'n',
  'ₒ': 'o',
  'ₚ': 'p',
  'ᵣ': 'r',
  'ₛ': 's',
  'ₜ': 't',
  'ᵤ': 'u',
  'ᵥ': 'v',
  'ₓ': 'x',
}

const COMBINING_DOT_ABOVE = /\u0307/g

export function satoriSafeText(input: string): string {
  let out = ''
  for (const ch of input) {
    if (ch in SUBSCRIPT_LETTER) {
      out += SUBSCRIPT_LETTER[ch]
      continue
    }
    if (ch === '⁻') {
      out += '-'
      continue
    }
    if (ch === '⁺') {
      out += '+'
      continue
    }
    if (ch === 'ė') {
      out += 'e'
      continue
    }
    out += ch
  }
  return out.replace(COMBINING_DOT_ABOVE, '').replace(/³⁄₂/g, '3/2').replace(/½/g, '1/2')
}
