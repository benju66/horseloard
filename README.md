# Horse Lord

Mobile-first tower defense PWA — you are the commander on the field: riding,
shooting, looting, building. See `DESIGN.md` for the spec, `CLAUDE.md` for
build rules, `BACKLOG.md` for milestone status.

## Development

```bash
npm install
npm run dev        # dev server on LAN (--host) — open on your phone
npm test           # Vitest (engine logic + schema validation)
npm run typecheck  # tsc --noEmit, strict
npm run build      # typecheck + production build to dist/
npm run icons      # regenerate placeholder PWA icons
```

## Deploy

Vercel, framework preset **Vite**, production branch `main`, build
`npm run build`, output `dist/`. No config file needed.
