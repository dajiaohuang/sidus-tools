import { afterEach, describe, expect, it, vi } from 'vitest'
import middleware, { config } from '../../middleware'

describe('privacy-page initial metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('patches the initial HTML metadata and includes the route in the middleware matcher', async () => {
    const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <title>SIDUS: Space Engineering Tools</title>
  <meta name="description" content="Home description" />
  <meta property="og:title" content="SIDUS: Space Engineering Tools" />
  <meta property="og:description" content="Home description" />
  <meta property="og:url" content="https://sidus.tools/" />
  <meta property="og:image" content="https://sidus.tools/og.png" />
  <link rel="canonical" href="https://sidus.tools/" />
</head>
<body></body>
</html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(indexHtml)))

    const response = await middleware(new Request('https://sidus.tools/privacy'))

    expect(config.matcher).toContain('/privacy')
    expect(response).toBeInstanceOf(Response)
    const html = await response!.text()
    expect(html).toContain('<title>Privacy · SIDUS</title>')
    expect(html).toContain(
      'How SIDUS uses cookies, Google Analytics via Tag Manager, and Cloudflare Web Analytics. Consent, retention, and your rights.',
    )
    expect(html).toContain('<link rel="canonical" href="https://sidus.tools/privacy" />')
  })
})
