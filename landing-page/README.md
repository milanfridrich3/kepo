# Kepo landing page

Static, dependency-free marketing page for `https://kepo.is-cool.dev`. It is independent of the app:
it imports nothing from `client/` and the app imports nothing from here. It links to the app's
`/login` and `/register` pages on `https://app.kepo.is-cool.dev`.

- `npm run build`: copies `src/` to `dist/` and fails if `index.html` references a missing local file.
- `npm run preview`: serves `dist/` locally (default `http://localhost:4173`, override with `PORT`).
- Needs Node.js 18 or newer; no environment variables, no rewrite rules.

Static-site hosting settings (see `../docs/DEPLOYMENT.md`): root directory `landing-page`, build command `npm run build`, publish directory `dist`.
