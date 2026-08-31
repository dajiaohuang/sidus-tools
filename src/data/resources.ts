export type Resource = {
  name: string
  org: string
  url: string
  description: string
  tags: string[]
}

export const RESOURCES: Resource[] = [
  {
    name: 'Apollo-11 AGC source',
    org: 'NASA / MIT (public domain)',
    url: 'https://github.com/chrislgarry/Apollo-11',
    description: 'Original Comanche055 & Luminary099 guidance computer source listings.',
    tags: ['apollo', 'historic', 'AGC'],
  },
  {
    name: 'Virtual AGC',
    org: 'ibiblio / Ron Burkey',
    url: 'https://www.ibiblio.org/apollo/',
    description: 'AGC emulator, listings, and historical documentation.',
    tags: ['apollo', 'historic'],
  },
  {
    name: 'NASA Open Data',
    org: 'NASA',
    url: 'https://data.nasa.gov/',
    description: 'Catalog of NASA open datasets and APIs.',
    tags: ['data', 'API'],
  },
  {
    name: 'NASA Open APIs',
    org: 'NASA',
    url: 'https://api.nasa.gov/',
    description: 'Official NASA API portal (APOD, NEO, Mars, etc.).',
    tags: ['API'],
  },
  {
    name: 'JPL Horizons',
    org: 'NASA / JPL',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    description:
      'Solar System ephemerides and body data via the web app and the REST API (ssd-api.jpl.nasa.gov/doc/horizons.html). SIDUS cites Horizons for constants; it does not wrap the ephemeris service.',
    tags: ['ephemerides'],
  },
  {
    name: 'NASA SPICE / NAIF',
    org: 'NASA / JPL',
    url: 'https://naif.jpl.nasa.gov/naif/',
    description:
      'SPICE Toolkit and kernels for trajectory geometry, with WebGeocalc and Cosmographia as the public NAIF interfaces. SIDUS does not embed the Toolkit.',
    tags: ['SPICE'],
  },
  {
    name: 'JPL SSD Tools',
    org: 'NASA / JPL',
    url: 'https://ssd.jpl.nasa.gov/tools/',
    description:
      'Horizons, small-body database, mission-design tables, orbit viewer, gravity fields, and SSD APIs.',
    tags: ['ephemerides', 'API', 'asteroids'],
  },
  {
    name: 'CNEOS',
    org: 'NASA / JPL',
    url: 'https://cneos.jpl.nasa.gov/',
    description:
      'Near-Earth object orbits, Sentry impact monitoring, close approaches, NHATS, and fireball reports.',
    tags: ['NEO', 'asteroids'],
  },
  {
    name: 'NASA Eyes',
    org: 'NASA / JPL',
    url: 'https://science.nasa.gov/eyes/',
    description:
      'Browser 3D views of the solar system, NEOs, Earth science, and missions. Visualization, not a Sidus calculator.',
    tags: ['visualization'],
  },
  {
    name: 'DSN Now',
    org: 'NASA / JPL',
    url: 'https://eyes.nasa.gov/apps/dsn-now/',
    description:
      'Live Deep Space Network antenna status, spacecraft links, data rates, and light-time.',
    tags: ['DSN', 'comms'],
  },
  {
    name: 'DESCANSO book series',
    org: 'NASA / JPL',
    url: 'https://descanso.jpl.nasa.gov/monograph/mono.html',
    description:
      'Free PDFs on deep-space communications, navigation, optical links, and radio science.',
    tags: ['literature', 'comms'],
  },
  {
    name: 'Basics of Spaceflight',
    org: 'NASA / JPL (Doody)',
    url: 'https://science.nasa.gov/learn/basics-of-space-flight/',
    description: 'Mission-operations tutorial covering the environment, flight paths, and ground systems.',
    tags: ['education'],
  },
  {
    name: 'NASA Software Catalog',
    org: 'NASA',
    url: 'https://software.nasa.gov/',
    description:
      'Agency software listing including JPL entries. Many codes need a Software Usage Agreement. Sidus does not wrap them.',
    tags: ['open-source'],
  },
  {
    name: 'JPL Open Source (GitHub)',
    org: 'NASA / JPL',
    url: 'https://github.com/orgs/nasa-jpl/repositories',
    description:
      'Public JPL repositories (flight software, DTN, rover kits, Earth science). Not Sidus physics.',
    tags: ['open-source'],
  },
  {
    name: 'Binary Space SpaceMissions',
    org: 'Binary Space',
    url: 'https://www.binary-space.com/spacemissions/',
    description:
      'Web 3D solar-system and mission viewer (TLE from CelesTrak, SPICE, CNEOS). Sidus cites it. Sidus does not embed or wrap it.',
    tags: ['visualization'],
  },
  {
    name: 'CelesTrak™',
    org: 'CelesTrak™',
    url: 'https://celestrak.org/',
    description:
      'GP element sets (the stations, Starlink, GNSS, weather and science groups SIDUS queries) plus curated special-event pages such as Artemis I. SIDUS caches and cites; it is not a CelesTrak mirror.',
    tags: ['TLE', 'catalog'],
  },
  {
    name: 'satellite.js',
    org: 'MIT license',
    url: 'https://github.com/shashwatak/satellite-js',
    description: 'Browser SGP4/SDP4 propagation library.',
    tags: ['SGP4', 'library'],
  },
  {
    name: 'Vallado software',
    org: 'David A. Vallado / CelesTrak™',
    url: 'https://celestrak.org/software/vallado-sw.php',
    description: 'Companion code and papers for Fundamentals of Astrodynamics.',
    tags: ['algorithms'],
  },
  {
    name: 'ESA Open Data',
    org: 'ESA',
    url: 'https://www.esa.int/About_Us/Business_with_ESA/Open_Space_Innovation_Platform',
    description: 'ESA open innovation and data initiatives.',
    tags: ['data'],
  },
  {
    name: 'Space-Track',
    org: 'USSF',
    url: 'https://www.space-track.org/',
    description: 'Official orbital object catalog (registration required).',
    tags: ['catalog'],
  },
  {
    name: 'NASA GRC: Beginner’s Guide to Aeronautics',
    org: 'NASA Glenn',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/',
    description: 'Rocket equation, Isp, thrust, and dynamic pressure education pages.',
    tags: ['propulsion', 'aero', 'education'],
  },
  {
    name: 'NASA OCHMO CO₂ brief',
    org: 'NASA OCHMO',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
    description: 'Crew metabolic and CO₂ exposure context for ECLSS education.',
    tags: ['ECLSS', 'crew'],
  },
  {
    name: 'NASA-STD-3001 / Human spaceflight standards',
    org: 'NASA',
    url: 'https://www.nasa.gov/ohp/standards/',
    description: 'Human-system standards overview (ppO₂ / atmosphere context).',
    tags: ['ECLSS', 'standards'],
  },
  {
    name: 'AeroVia Aerospace Tools',
    org: 'AeroVia',
    url: 'https://www.aerovia.org/tools',
    description: 'Public catalog of ISA, max-q, launch azimuth, RF link, and SSO-class calculators.',
    tags: ['calculators', 'reference'],
  },
  {
    name: 'BIPM SI Brochure',
    org: 'BIPM',
    url: 'https://www.bipm.org/en/publications/si-brochure',
    description: 'SI base units for unit conversion and reporting.',
    tags: ['SI', 'units'],
  },
  {
    name: 'Starcloud white paper (2024)',
    org: 'Lumen Orbit / Starcloud',
    url: 'https://starcloudinc.github.io/wp.pdf',
    description: 'Orbital data center rationale: dawn-dusk SSO, radiator worked example, 5 GW array sizing. Cited, not endorsed.',
    tags: ['thermal', 'reference'],
  },
  {
    name: 'Orbital Data Centers: Spacecraft Constraints and Economic Viability',
    org: 'S. G. Turyshev (arXiv)',
    url: 'https://arxiv.org/abs/2604.27197',
    description: 'Lumped power / thermal / mass closure for MW-class orbital compute nodes.',
    tags: ['thermal', 'reference'],
  },
  {
    name: 'NIST Chemistry WebBook: fluid properties',
    org: 'NIST',
    url: 'https://webbook.nist.gov/chemistry/fluid/',
    description: 'Saturation and single-phase thermophysical data for working fluids (ammonia, water, CO₂, R134a).',
    tags: ['data', 'reference'],
  },
  {
    name: 'NASA RP-1121 thermal-control coatings',
    org: 'NASA GSFC (Henninger, 1984)',
    url: 'https://ntrs.nasa.gov/citations/19840015630',
    description: 'Solar absorptance and thermal emittance of common spacecraft coatings.',
    tags: ['thermal', 'data'],
  },
  {
    name: 'SIDUS MCP server',
    org: 'sidus.tools',
    url: 'https://sidus.tools/api/mcp',
    description:
      'Public Streamable HTTP MCP endpoint: add the URL to any MCP client (no local install). Optional stdio for offline.',
    tags: ['MCP', 'AI', 'open-source'],
  },
]
