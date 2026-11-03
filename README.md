# Gatehouse

Vehicle sign-in for the gate (repository: form-generator).

A small iPhone app for signing vehicles in and out at the gate and printing the
day's sheet as a PDF. It works with no signal.

## What it does

- **+** signs a vehicle in. Type the registration: if the car is in the master
  list, the name and company fill in by themselves. If not, **Add new car**
  opens a short form and the car is added to the master list too.
- Time in is stamped with the current time (24-hour), and can be changed.
- Tap a vehicle on site, then **Time out now**. **Everyone out** signs out every
  vehicle still on site at one time, e.g. 17:00.
- **Export PDF** makes the day's sheet on A4: date, *Bannold Drove Crossing -
  Vehicle Records*, Name · Company · To see · Time in · Time out · Registration,
  and the total. Any detail left empty prints as `//`.
- **Master list**: import your Excel master file, add or edit cars, and export
  it back to Excel as a backup.
- **Past days**: every day is kept and can be exported again.

## Offline and where data lives

It is a Progressive Web App. Once added to the iPhone Home Screen it opens and
works with no signal. All data is stored on the phone only (in the browser's
IndexedDB) — there is no server and no account. Open it from the Home Screen
icon, not from Safari, so iOS keeps the data. Export the master list now and
then as a backup.

## Development

```
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run typecheck
npm run build      # production build into dist/
```

| Part | Choice |
| --- | --- |
| Language / UI | TypeScript, React, Vite |
| Offline | vite-plugin-pwa (service worker caches the whole app) |
| Storage | IndexedDB via Dexie |
| PDF | jsPDF + jspdf-autotable |
| Excel | read-excel-file / write-excel-file |
| Hosting | GitHub Pages (`.github/workflows/deploy.yml`, deploys on push to `main`) |

Site-specific text (the PDF title, the "To see" quick buttons) is in
`src/config.ts`.
