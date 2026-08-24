# Published SGP4 verification data

Verbatim copies of the SGP4/SDP4 verification files published with
Vallado, Crawford, Hujsak, Kelso, **"Revisiting Spacetrack Report #3"**,
AIAA 2006-6753.

These files are reference data, not source. They are never edited: if a port
disagrees with a number here, the port is wrong.

## Run

```bash
npx tsx scripts/verify-native-sgp4.ts
```

Compiles `src/lib/snippets/native/sgp4/sgp4.c` and asserts every row of
`tcppver.out`. Exit code 1 on any mismatch.

## Files

| File | Lines | Bytes | SHA-256 |
|------|-------|-------|---------|
| `SGP4-VER.TLE` | 110 (CRLF) | 8616 | `d246d1d9d768ace445a38a965713fa9ba52d80fd8a41a0502ff83d7acffe2881` |
| `tcppver.out` | 700 (LF) | 140162 | `687bf28dbe52df86e8e60ab5cb4a08d1aa3dbcaf4e63b1f7ab95f044fbe3833b` |

Downloaded 2026-08-19.

## Origin

`SGP4-VER.TLE` was extracted from the official AIAA distribution:

- <https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.zip>
  (SHA-256 `3642043b706c76be87cf012db3f22e04da6b80498d00f515e51879e0ffadc115`)
- archive member `sgp4/cpp/testsgp4/SGP4-VER.TLE`

The archive ships three byte-identical copies of that file
(`sgp4/cpp/testsgp4/`, `sgp4/cpp/testsgp4/TestSGP4/`, `sgp4/mat/`).

`tcppver.out` is **not** present in that archive. The archive ships the
Fortran, MATLAB and Java verification outputs (`for/tforverf.out`,
`mat/tmatverDec2015.out`, `java/JAVA_SGP4_v2/java_sgp4_ver.out`) but not the
C++ one, which `TestSGP4.cpp` writes at run time. The copy here comes from
python-sgp4 (MIT, Brandon Rhodes), which redistributes the published C++
output unchanged:

- <https://raw.githubusercontent.com/brandon-rhodes/python-sgp4/master/sgp4/tcppver.out>

python-sgp4's copy of `SGP4-VER.TLE` has the same SHA-256 as the archive
member vendored here, which is the cross-check that the two sources agree.

## Contents

`SGP4-VER.TLE` holds 33 TLE pairs (satellite 20413 appears twice with
different time ranges) plus comment lines. Each line 2 carries three extra
fields after the checksum: start, stop and step in minutes from epoch. That
is Vallado's verification mode, described in `sgp4io.cpp`.

`tcppver.out` holds 33 `<satnum> xx` headers and 667 data rows: time since
epoch in minutes, then position (km) and velocity (km/s) in TEME.

Seven satellites stop early with a documented error code, in file order:

| Satellite | Code | Condition |
|-----------|------|-----------|
| 22312 | 1 | mean eccentricity -0.001329 out of range |
| 28350 | 1 | mean eccentricity -0.001208 out of range |
| 28872 | 6 | mrt 0.996159 below 1.0, decayed |
| 29141 | 6 | mrt 0.996252 below 1.0, decayed |
| 33333 | 4 | semi-latus rectum -0.103223 below zero |
| 33334 | 3 | perturbed eccentricity -122.217193 out of range |
| 20413 | 6 | mrt 0.830534 below 1.0, decayed |

Satellite 33334 fails at time 0, so its single row in `tcppver.out` repeats
the previous satellite's last data line. That is a stale output buffer in
`TestSGP4.cpp`, not a propagation result, and the harness asserts it as a
repeat rather than as physics.

## Generating conditions

`tcppver.out` was produced with **WGS-72** constants and **opsmode `i`**
(improved), not opsmode `a` (afspc). Two independent confirmations:

- python-sgp4 runs its own `tcppver.out` integration test through
  `io.twoline2rv(line1, line2, wgs72)`, whose signature defaults to
  `opsmode='i'`, and through `Satrec.twoline2rv(line1, line2)`, which
  `model.py` forwards as `twoline2rv(line1, line2, whichconst, 'i', self)`.
- Running the C port here in both modes: opsmode `i` reproduces every row to
  under 1e-4 m, while opsmode `a` moves satellite 23599 (ARIANE 42P+3 R/B,
  the AcTan Lyddane case) by up to 960 m. Only that one satellite differs;
  opsmode changes `gsto` and the `nodep < 0` branch of `dpper`.

## Transcription audit (2026-08-19)

The four satellites already used in `src/lib/physics/sgp4.test.ts` were
checked against these files. All 8 TLE lines are byte-identical and all 12
published state vectors match to the last printed digit:

| Satellite | TLE lines | Rows checked |
|-----------|-----------|--------------|
| 00005 | 3, 4 | t = 0, 360, 4320 |
| 06251 | 10, 11 | t = 0, 120, 2880 |
| 28129 | 72, 73 | t = 0, 720, 1440 |
| 24208 | 54, 55 | t = 0, 720, 1440 |

## What this is not

Educational verification data for an analytical propagator. It certifies that
an SGP4 implementation reproduces the published reference run. It does not
certify operational conjunction, reentry or ephemeris products.

---

# Solar-system ephemeris reference data

Sources and reference vectors for `src/lib/physics/planets.ts`, covering the
JPL/Standish approximate planetary positions, Vallado's low-precision lunar
ephemeris and the IAU rotational elements. Same rule as above: these files are
reference data, never edited.

## Run

```bash
npx vitest run src/lib/physics/planets.test.ts
```

The test parses these files directly. Nothing here is hand-copied into the
test, and all three model sources are re-parsed to audit every transcribed
constant on each run.

## Files

| File | Lines | Bytes | SHA-256 |
|------|-------|-------|---------|
| `standish-approx-pos.html` | 883 (LF) | 29585 | `9f7b30ca81cc548a879565bb3f70e6899a38ff5877cb1ff16bb04892f9c4d742` |
| `vallado-moon.m` | 106 (CRLF) | 4035 | `1100ed0828bd4a93b792532428ff01011b806e962ac692daf294b224708eea60` |
| `pck00011.tpc` | 4318 (LF) | 131226 | `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1` |
| `horizons-199-mercury.txt` | 96 (LF) | 5152 | `7eb92fcde280baa832969349f6122e6795652924b3c52d74e374a73dbe1d9fb9` |
| `horizons-299-venus.txt` | 96 (LF) | 5152 | `f7b7af3799ba44bc3af399bf5e6bac9f3f7aeee5b47a7556eee36dae1eafcf81` |
| `horizons-3-embary.txt` | 96 (LF) | 5152 | `a83c5980eda1bb53fe59e4f80b0f4b8c197c7c6af7f725f3cfe3d90b6c8b60ab` |
| `horizons-399-earth.txt` | 96 (LF) | 5152 | `9cc5243f87a219f7f38f2c869f4636794ecbec6c39766d21310b0d9d397ea01a` |
| `horizons-499-mars.txt` | 96 (LF) | 5153 | `34b308048b24ccf77b3146a154151dbb93b1ccd07236d7e64b450f50556b71a0` |
| `horizons-599-jupiter.txt` | 96 (LF) | 5168 | `0d1774d0ee4eed9c7805154111a24501f1d1b3c9ca0cedd0cf674c4c1ab829cc` |
| `horizons-699-saturn.txt` | 96 (LF) | 5154 | `1718fa24838d648456569c0c9548d0cd1a14c8de76c7d1934d407d0a7173564d` |
| `horizons-799-uranus.txt` | 96 (LF) | 5160 | `3076f3cbc49fa7e1ac74239b1270f20b8fd0b41adc448af7a905ebb0acaf0f74` |
| `horizons-899-neptune.txt` | 96 (LF) | 5168 | `6817a42f0bf6ab313c803bb0a5cec2758dc15e3bc59d8baf30c68aca4f6fbf87` |
| `horizons-301-moon-eq.txt` | 97 (LF) | 5230 | `87e85c4efa3268205820fc33239da3a5ee967036eee722d3b8f1033075fbbe4d` |
| `horizons-obs-299-venus.txt` | 132 (LF) | 6983 | `de2dec6edd88a923f7b0f1758ef97311b9f2a36f17abca9f7be3d83e2e79ff98` |
| `horizons-obs-301-moon.txt` | 132 (LF) | 6985 | `ecb7268ba0e4dab0604aeb5813e18dc8b267a3195b5518c325f5893401e54151` |
| `horizons-obs-499-mars.txt` | 132 (LF) | 6984 | `8bbd982b4ac6175961adb59b554c963143f635a2c83fc3cbb1fff5619b2893c8` |
| `horizons-obs-599-jupiter.txt` | 132 (LF) | 6999 | `039994ae4bc5c003d4197338cca237c60360dedec72544f0c5c5cd4adf5f1a59` |
| `horizons-obs-699-saturn.txt` | 132 (LF) | 6985 | `04f15b73a2fcd5f643d95cefb31982115bdcb8d115117111e1e18e43075fd75f` |

Downloaded 2026-08-20.

## Origin

### `standish-approx-pos.html`

- <https://ssd.jpl.nasa.gov/planets/approx_pos.html>

The URL published in most references, `https://ssd.jpl.nasa.gov/txt/aprx_pos_planets.pdf`,
now returns HTTP 301 to the page above, and the machine-readable element
tables that used to sit at `/txt/p_elem_t1.txt` and `/txt/p_elem_t2.txt` both
404. The HTML page is the surviving form of the document and carries the full
content: Table 1, Table 2a, Table 2b, the accuracy table, the algorithm and
the Kepler iteration. JPL credits it to "an article written by E.M. Standish
and J.G. Williams in 1992", reformatted for the web with Pluto removed.

Table 1 sits in the page's first `<pre>` block as fixed-width text, which is
why it is vendored as HTML rather than transcribed to a data file: the
assertion can read the published bytes.

One error in the source worth knowing: the Table 1 column header labels the
eccentricity column "rad, rad/Cy". Eccentricity is dimensionless. The values
are unaffected.

### `vallado-moon.m`

Archive member `matlab/moon.m`, extracted unchanged from Vallado's published
companion software:

- <https://celestrak.org/software/vallado/matlab.zip>
  (SHA-256 `714c6c0bc04918adc4c3b7b6ce0373c58a82a576db9aee6a10a76acc2d2b66f5`,
  529159 bytes)

The file's own header cites "vallado 2007, 290, alg 31, ex 5-3". It is the
companion of Algorithm 29 (`matlab/sun.m`), which is the algorithm
`satellite.js` implements as `sunPos` and which this codebase wraps as
`sunEciSi`. That shared lineage is why the raw Moon series and the Sun come
out in the same frame here with no extra assumption.

The archive is not vendored: only the one 4 KB member the module transcribes
is, following the same practice as `SGP4-VER.TLE` above.

### `pck00011.tpc`

- <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc>

NAIF's generic planetary constants kernel, which encodes Archinal et al.,
"Report of the IAU Working Group on Cartographic Coordinates and Rotational
Elements: 2015", Celestial Mechanics and Dynamical Astronomy. Cite both: the
kernel is the artifact actually read, the report is the authority behind it.

The report itself is not openly retrievable. Springer serves an HTML cookie
wall for both the 2015 paper and the 2009 predecessor even with a browser user
agent, referer and cookie jar; the USGS reprint URLs return an Astropedia
"Error 404" body under HTTP 200, and `astropedia.astrogeology.usgs.gov` fails
its TLS handshake. The kernel is the strongest open provenance available, and
it is machine-readable, which removes transcription risk rather than adding it.

Two details from the kernel's own text that matter here. Its independent
variable is TDB, with pole terms in Julian centuries past J2000 and prime
meridian terms in days past J2000. And Earth and Moon carry **2009** values,
because, in the kernel's words, "the 2015 report does not provide orientation
data for the Earth or Moon".

The file mixes live data with commentary: superseded values appear in
`\begintext` regions in lowercase, current ones in `\begindata` regions in
uppercase. Only `\begindata` content is read, both by SPICE and by the audit
test.

### `horizons-*.txt`

Raw, unedited responses from the JPL Horizons API:

- <https://ssd.jpl.nasa.gov/api/horizons.api>

Each file is one request with these parameters, differing only in `COMMAND`,
`CENTER` and `REF_PLANE`:

```
format=text  OBJ_DATA='NO'  MAKE_EPHEM='YES'  EPHEM_TYPE='VECTORS'
REF_SYSTEM='ICRF'  VEC_TABLE='2'  VEC_CORR='NONE'  OUT_UNITS='KM-S'
CSV_FORMAT='YES'  TLIST_TYPE='JD'  TLIST='2451544.5 2462502.5'
```

`VEC_CORR='NONE'` selects geometric states, not astrometric or apparent ones,
which is what a Keplerian model should be compared against. The two epochs are
2000-01-01 and 2030-01-01, both 00:00 TDB.

| File | `COMMAND` | `CENTER` | `REF_PLANE` | Horizons source |
|------|-----------|----------|-------------|-----------------|
| mercury | `199` | `500@10` | `ECLIPTIC` | DE441 |
| venus | `299` | `500@10` | `ECLIPTIC` | DE441 |
| embary | `3` | `500@10` | `ECLIPTIC` | DE441 |
| earth | `399` | `500@10` | `ECLIPTIC` | DE441 |
| mars | `499` | `500@10` | `ECLIPTIC` | mar099 |
| jupiter | `599` | `500@10` | `ECLIPTIC` | jup365_merged |
| saturn | `699` | `500@10` | `ECLIPTIC` | sat441l |
| uranus | `799` | `500@10` | `ECLIPTIC` | ura184_merged |
| neptune | `899` | `500@10` | `ECLIPTIC` | nep098_merged |
| moon | `301` | `500@399` | `FRAME` | DE441 |

Body `3`, the Earth-Moon barycentre, is what Standish's "EM Bary" row models,
so it is the correct target for the element comparison. Body `399` is the
separate check on `earthHeliocentricEclipticSi`, which subtracts the lunar
offset to recover Earth's centre.

The giant planets are fetched as body centres (`599`, `699`, `799`, `899`)
rather than system barycentres (`5`, `6`, `7`, `8`), matching how the table
labels its rows. The choice is immaterial: at these epochs the two differ by
57 km for Jupiter and 115 km for Neptune, four orders of magnitude below the
deviations being measured.

### `horizons-obs-*.txt`

Horizons OBSERVER tables, the reference for geocentric apparent direction and
angular diameter. Same endpoint, different ephemeris type:

```
format=text  OBJ_DATA='NO'  MAKE_EPHEM='YES'  EPHEM_TYPE='OBSERVER'
CENTER='500@399'  QUANTITIES='1,2,13,20'  CSV_FORMAT='YES'
TLIST_TYPE='JD'  TLIST='2451544.5 2462502.5'
```

Quantity 1 is astrometric RA/Dec in the ICRF, 2 is airless apparent RA/Dec,
13 is angular diameter and 20 is range. Bodies are Moon `301`, Venus `299`,
Mars `499`, Jupiter `599` and Saturn `699`.

One difference from the VECTORS files matters. Observer tables are timestamped
in **UT**, not TDB: the column header reads `Date__(UT)__HR:MN:SC.fff`. Feeding
the same JD to both means this module evaluates its dynamics about 69 s later
than Horizons does. That is not papered over, it is the module's documented
UTC-as-TDB approximation showing up end to end, and it is counted in the
tolerance below.

Re-running these requests will not reproduce the files byte for byte. Each
response embeds its own generation timestamp in the header line that begins
`Ephemeris / API_USER`. The ephemeris rows are what matters and are stable.

## Transcription audit (2026-08-20)

All three audits are executed by `planets.test.ts` on every run rather than
being one-time manual checks.

**Standish Table 1.** All 96 numeric cells, being 8 rows by 2 lines by 6
columns, are re-parsed out of the `<pre>` block in `standish-approx-pos.html`
and compared for exact equality against `PLANET_ELEMENTS_J2000`. The published
accuracy table is parsed from the page's first `<table>` and compared against
`PLANET_NOMINAL_ERROR`, all 24 figures.

That second check earned its place immediately. The first cut of the module
read the ρ column correctly as thousands of km but encoded it as `1e9` m per
unit instead of `1e6`. Every planetary tolerance came out 1000x too loose and
the entire suite passed green, Neptune included. The audit caught it on the
first run. This is the argument for auditing published constants
programmatically rather than eyeballing them once: a wrong tolerance does not
announce itself, it just stops failing.

**Vallado Algorithm 31.** The vendored `vallado-moon.m` was executed unmodified
under Octave, together with its own `constmath.m` and `constastro.m` from the
same archive, at five epochs spanning 1800 to 2050. The port reproduces those
outputs to 1e-9 relative after one deliberate substitution: Vallado's
`constastro.m` uses an Earth radius of 6378.1363 km where this codebase uses
6378.137 km, a 0.7 m difference that scales to about 40 m at lunar distance.
The Octave outputs are pinned in the test, which compares against
`moonGeocentricMeanOfDateSi` so that no frame rotation sits between the series
and the assertion.

**NAIF kernel.** All 90 polynomial coefficients, being 10 bodies by 3
quantities by 3 terms, are re-parsed from the `\begindata` regions of
`pck00011.tpc` and compared for exact equality against `BODY_ROTATION`. The
three carried nutation series are checked the same way, 244 values in total:
angle coefficients from `BODY3_`, `BODY4_` and `BODY8_NUT_PREC_ANGLES` and
amplitudes from the `NUT_PREC_RA`, `_DEC` and `_PM` arrays of bodies 301, 499
and 899, with the array lengths asserted so a truncation would fail.

Mars carries an independent cross-check that no audit of the vendored numbers
could provide, because it compares two IAU report generations against each
other. The kernel keeps the superseded 2009 Mars model in its commentary,
`body499_pole_ra = ( 317.68143 -0.1061 0. )` and
`body499_pole_dec = ( 52.88650 -0.0609 0. )`. The 2015 model reaches the same
pole by a different route: a polynomial displaced to 317.269202 and 54.432516
plus periodic terms that carry it back. With the series applied the two models
agree to 2.1 arcsec in right ascension and 0.2 arcsec in declination at J2000;
without it they disagree by 0.41 and 1.55 deg. The test bounds the gap at
0.01 deg, which is unreachable unless the Mars series is both transcribed and
applied correctly.

## Rotation models: what is included

Polynomial terms are implemented in full for all ten bodies. Periodic
(nutation-precession) terms are carried for every body whose series peaks
above **0.05 deg**, and where carried the complete published set is used
rather than a truncation.

| Body | RA | Dec | W | Terms | Status |
|------|----|-----|---|-------|--------|
| Moon | 3.879 deg | 1.542 deg | 3.561 deg | 13 | carried |
| Mars | 0.419 deg | 1.591 deg | 0.585 deg | 26 | carried |
| Neptune | 0.700 deg | 0.510 deg | 0.480 deg | 8 | carried |
| Mercury | none | none | 0.011 deg | 5 | excluded |
| Jupiter | 0.002 deg | 0.001 deg | none | 15 | excluded |

The Sun, Venus, Earth, Saturn and Uranus have no periodic series at all. Among
the ten bodies modelled here, Mercury and Jupiter are the only two below the
threshold, and the audit asserts that fact directly: it recomputes each body's
peak amplitude from the kernel and requires the carried/excluded decision to
match, so a kernel update that enlarged a series would fail rather than pass.
The kernel does hold much larger series for planetary satellites, up to
44.85 deg for Mimas and 32.35 deg for Triton, but no satellite is modelled here.

Mars is the reason the threshold exists rather than a blanket "skip the small
periodic terms" rule. Its three largest amplitudes attach to an angle advancing
at 0.5042615 deg/century, a period near 714000 years, so they are not
oscillations on any timescale this catalog covers: dropping them would tilt the
planet by a near-constant 1.5 deg. Neptune's single periodic angle advances at
52.316 deg/century, so its terms genuinely oscillate over about 6.9 years.

Two structural details the implementation has to respect. Mars sets
`BODY4_MAX_PHASE_DEGREE = 2`, so its phase angles are quadratic in T, three
coefficients each, where the Moon's and Neptune's are linear. And each body's
angles live on its system barycentre: the Moon's on body 3, Mars' on 4,
Neptune's on 8.

## Measured accuracy

Model versus Horizons at the two pinned epochs, total position deviation
against the tolerance in force for that body:

| Body | 2000-01-01 | 2030-01-01 | Tolerance | Worst margin | Basis |
|------|-----------:|-----------:|----------:|-------------:|-------|
| Mercury | 1037 km | 458 km | 6411 / 4628 km | 4.5x | published |
| Venus | 8142 km | 7405 km | 14969 / 14956 km | 1.8x | published |
| EM Bary | 1990 km | 5867 km | 25969 km | 4.4x | published |
| Earth | 1990 km | 5858 km | 26006 km | 4.4x | published + moon |
| Mars | 8238 km | 39180 km | 67370 / 67081 km | 1.7x | published |
| Jupiter | 1150257 km | 469994 km | 2076492 / 2212237 km | 1.9x | published |
| Saturn | 3847977 km | 1836722 km | 5663035 / 5635620 km | 1.5x | published |
| Uranus | 1077527 km | 102670 km | 1751415 / 1724867 km | 1.6x | published |
| Neptune | 1099650 km | 233029 km | 2000000 km | 1.8x | **calibrated** |
| Moon | 271 km | 1275 km | 3000 km | 2.4x | **calibrated** |

The Moon also runs against Vallado's own published DE430 check vector for
1994-04-28, printed in `ex5_3.m` inside the same sha256-pinned archive as the
series. Deviation there is 769 km, a 3.9x margin.

The published tolerance is `ρ + d·λ + d·φ`, the three published nominal errors
for that body evaluated at its actual heliocentric distance and summed.
Summing rather than taking a root-sum-square is the generous reading; nothing
else stands between the published table and the bound, and no per-body number
is adjusted. Where two figures appear, the tolerance differs between the epochs
because the body's distance does.

Earth's bound is the barycentre bound plus the calibrated Moon bound scaled by
the lunar mass fraction, since `earthHeliocentricEclipticSi` propagates the
Moon model's error at that fraction.

### Empirically calibrated accuracy

Two bodies do not have a usable published bound, so theirs are **measured
against JPL Horizons, not a published accuracy claim**. The procedure is the
same for both: sample a dense grid of epochs that **excludes both golden test
epochs**, take the maximum position deviation D_max, and set the tolerance to
1.25 x D_max rounded up to a clean figure. The calibration set and the test set
are disjoint by construction, so nothing here is tuned to make a test pass.

| Body | Grid | Epochs | D_max | 1.25 x D_max | Tolerance |
|------|------|--------|-------|--------------|-----------|
| Moon | 2000-01-15 to 2035-01-15 | 4001 | 2323.9 km | 2904.8 km | 3000 km |
| Neptune | 1800-01-15 to 2049-12-15 | 201 | 1590300.2 km | 1987875.2 km | 2000000 km |

Reproduce with the same Horizons request as the golden files, replacing
`TLIST` with `START_TIME`, `STOP_TIME` and `STEP_SIZE='4000'` for the Moon or
`STEP_SIZE='200'` for Neptune. The Moon grid was also run at 401 epochs and
returned an identical D_max at the identical epoch, 2008-11-15, which is the
check that the ~3.2-day spacing is not aliasing against the lunar month.

Why each one needs calibration:

- **Moon.** Vallado states no accuracy figure for Algorithm 31 anywhere in the
  distribution. `sun.m` states 0.01 deg for Algorithm 29; the moon routine
  states nothing. There is no published number to derive a bound from.
- **Neptune.** There is a published figure and this model does not meet it.
  See below.

### Published-accuracy discrepancy: Neptune

The Standish page's nominal errors date from the DE200 era. Measured against
modern JPL Horizons over 101 epochs spanning the full 1800-2050 validity
window, they hold for seven of the eight planets on an RMS basis and
understate Neptune by roughly 2.9x in longitude and 3.4x in distance.

Per-component error, RMS and maximum, against the published figure in
parentheses:

| Body | λ arcsec | φ arcsec | ρ 1000 km |
|------|----------|----------|-----------|
| Mercury | 7.6 / 23.0 (15) | 0.64 / 2.31 (1) | 0.7 / 1.7 (1) |
| Venus | 11.2 / 26.5 (20) | 0.52 / 1.54 (1) | 2.5 / 6.1 (4) |
| EM Bary | 8.6 / 19.7 (20) | 0.68 / 1.76 (8) | 2.9 / 7.1 (6) |
| Mars | 29.9 / 85.6 (40) | 0.71 / 2.40 (2) | 13.7 / 33.8 (25) |
| Jupiter | 208.5 / 515.9 (400) | 3.38 / 8.69 (10) | 323.9 / 622.0 (600) |
| Saturn | 359.1 / 737.6 (600) | 11.97 / 29.95 (25) | 1162.4 / 2802.1 (1500) |
| Uranus | 50.8 / 121.8 (50) | 1.30 / 3.53 (2) | 750.5 / 2170.0 (1000) |
| **Neptune** | **28.8 / 60.0 (10)** | 0.69 / 1.67 (1) | **688.9 / 1580.8 (200)** |

Uranus is borderline in longitude at 1.02x RMS and still passes its combined
envelope comfortably. Peaks run two to three times RMS throughout, which is the
expected shape for a least-squares fit with sinusoidal residuals, and the
page's own wording is "nominal errors" rather than maximum errors, so
individual epochs above a table figure are normal. Neptune is different in kind:
even the window-wide RMS is three times over.

Three candidate explanations were tested and ruled out. Body centre versus
system barycentre accounts for 115 km. Table 2a with its Table 2b corrections
is far worse inside this window, 1.89e6 and 2.02e6 km at the two epochs against
Table 1's 1.10e6 and 0.23e6 km, consistent with its stated 3000 BC to 3000 AD
fit. And the transcription is verified cell-exact against the source.

So Neptune's golden runs on the calibrated bound above. This implementation
does not match the published accuracy for Neptune and no part of this
repository should claim that it does.

## Geocentric apparent direction

`bodyGeocentricEquatorialOfDateSi` exists because the Earth-fixed globe view
rotates by GMST, and GMST is defined against the equinox **of date**. Feeding
it a J2000 vector mixes two equinoxes and injects the whole accumulated
precession, about 0.36 deg by 2026, which is close to a lunar diameter. So the
planetary chain runs heliocentric ecliptic, subtract Earth's centre, rotate by
the obliquity, then precess J2000 to of-date. The Moon skips the last step
because Algorithm 31 already lands in that frame; routing it through the J2000
form would precess it away and straight back.

Measured against Horizons apparent places at the two pinned epochs:

| Body | 2000-01-01 | 2030-01-01 | Tolerance | Worst margin |
|------|-----------:|-----------:|----------:|-------------:|
| Moon | 147.2" | 675.4" | 1603" / 1758" | 2.6x |
| Venus | 43.7" | 11.2" | 110" / 270" | 2.5x |
| Mars | 42.4" | 34.5" | 130" / 122" | 3.1x |
| Jupiter | 360.8" | 85.6" | 689" / 574" | 1.9x |
| Saturn | 561.6" | 231.7" | 967" / 980" | 1.7x |

**Apparent, not astrometric.** Horizons offers both and the choice is not
cosmetic: at the 2030 epoch this chain sits 1500 to 2000 arcsec from the
astrometric places and 11 to 675 arcsec from the apparent ones, because
astrometric places are ICRF and apparent ones are of-date. Matching the frame
first, then accounting for what remains, is the only comparison that measures
model quality rather than a frame mismatch.

**What remains, and why 60 arcsec covers it.** Against an apparent place this
chain omits stellar aberration, bounded by the constant of aberration at
20.5 arcsec; nutation, bounded by the roughly 17.2 arcsec maximum nutation in
longitude, since the chain is mean-of-date rather than true-of-date; and the
69 s UTC-as-TDB offset described above, worth about 38 arcsec for the Moon and
under 4 arcsec for the planets. Rather than trust that arithmetic, the pair of
frame-independent terms was measured directly out of Horizons itself by
precessing its astrometric places to of-date and comparing them against its
apparent places: across the ten body-epoch pairs that peaks at 30.6 arcsec. The
60 arcsec allowance sits above both the measured peak and the analytic sum.

The rest of each tolerance is the model's own position uncertainty seen at the
body's actual geocentric distance. For a planet that is a difference of two
modelled positions, so both envelopes enter, the planet's and Earth's, the
latter carrying the lunar-offset correction exactly as the Earth golden does.

### Angular diameter is defined differently at each end

`bodyApparentAngularDiameterRad` returns the mean-sphere diameter, since
`BODIES` carries mean radii and a spherical billboard wants a mean sphere.
Horizons publishes, in its own words, "the equatorial angular width of the
target body full disk". For a nearly spherical body the two agree, but the
giants are visibly oblate and the definitions diverge:

| Body | `BODIES` radius | Horizons equatorial | Ratio |
|------|----------------:|--------------------:|------:|
| Moon | 1737.4 km | 1737.4 km | 1.00000 |
| Venus | 6051.8 km | 6051.8 km | 1.00000 |
| Mars | 3389.5 km | 3396.19 km | 0.99803 |
| Jupiter | 69911 km | 71492 km | 0.97789 |
| Saturn | 58232 km | 60268 km | 0.96622 |

Compared naively the giants look 2.2% and 3.4% wrong. They are not wrong, they
answer a different question. So the test asserts the ratio the two definitions
should produce, taking the equatorial radius from the `Target radii` header of
the same vendored file, and holds it to 2%. Measured agreement is 0.01% to
0.11% across all five bodies, which is a tighter statement than the naive
comparison could ever have made rather than a relaxed one.

## Frames

The Moon deserves an explicit note because two frames are in play. Algorithm 31
produces a mean-equator-and-equinox-of-date vector, which is also what
`sunEciSi` returns. `moonGeocentricEciSi` rotates that to J2000 using the
IAU 1976 precession angles, so it is frame-consistent with the heliocentric
states and with Horizons' ICRF output; `moonGeocentricMeanOfDateSi` exposes the
raw series for anyone who needs to match the legacy convention.

The rotation is not cosmetic. Against Horizons at 2030 the raw series sits
3698 km out and the rotated one 1275 km, so roughly two thirds of the raw
residual was frame rather than model error. Folding that into a tolerance would
have quietly inflated the Moon's bound by a factor of three and hidden the
model's real behaviour. `sunEciSi` and its property-bound tests are left
untouched for existing consumers.

## What this is not

Reference data for a low-precision analytical ephemeris. It certifies that this
implementation reproduces the published algorithms and stays inside the bounds
documented here, published where a published bound holds and measured where it
does not. It is not an ephemeris product: for anything needing real accuracy,
query Horizons directly.
