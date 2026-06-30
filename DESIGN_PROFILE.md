# The Snow Media — Brand & Design Profile

Source: https://thesnowmedia.com (WordPress theme `thesnowmedia-theme`), extracted 2026-06-30 via playwright-cli + computed-style inspection. Use this for any Snow Media UI so it stays on-brand.

## Identity
- Boutique PPC studio. Tone: premium, confident, clean. Tagline: **Grow. Scale. Thrive.**
- Logo (navy, for light backgrounds): `logo-dark.png` — snowflake mark + "THE SNOW MEDIA" royal-blue wordmark + gold tagline. 518x195.
- Logo (white, for navy backgrounds): `logo-white.png`
- Favicon: snowflake, `/wp-content/uploads/2026/04/favicon-512-*.png`
- Local copies saved in `server/public/`: `snow-logo.png`, `snow-logo-white.png`, `favicon.png`

## Typography
- **Display / headings / big numbers: Outfit** (800 hero, 700 section heads). Fallback Montserrat.
- **Body / labels / buttons: Montserrat** (400-700).
- Eyebrow labels: Montserrat 700, UPPERCASE, letter-spacing ~0.12em, royal blue.
- No serifs. No monospace (brand numbers are Outfit, not mono).

## Color
| Token | Hex | Use |
|-------|-----|-----|
| Navy (deep) | `#001468` | Primary headings, key numbers |
| Royal blue | `#263B80` | Links, labels, logo, secondary text |
| Gold | `#FFB949` | Primary CTA (pill), highlights ("revenue", "90 Days"), accents |
| Gold dark | `#EAB155` | CTA hover / gradient |
| Body gray | `#454545` | Body copy on white |
| White | `#FFFFFF` | **Page background** and cards |
| Pale blue | `#F0F6FB` | Stat tiles, soft surfaces, chips |
| Near-white | `#FAFBFC` | Subtle card fills |
| Card border | `~#E5ECF4` | Hairlines |

Background is **mostly white**. Navy is structural, gold is the single decorative accent. Gold is too light for body text on white — use it for fills/pills/underlines, not paragraph text.

## Components
- **Primary CTA:** gold (`#FFB949`) **pill** (border-radius 50px), navy/white bold text.
- **Secondary:** white bg, navy text, pill outline.
- **Cards:** white, radius 16px, subtle border + soft shadow.
- **Stat block:** pale-blue (`#F0F6FB`) tile, big **navy** number (Outfit bold), small gray UPPERCASE label. (This is the KPI pattern.)
- **Chips:** `#F0F6FB` bg, navy text, radius 12px.

## Layout vibe
White, airy, generous whitespace, navy headings, gold punctuation, rounded 16px cards, fully-rounded pill buttons. Hero/footer use navy bands with the white logo; everything else is white.
