# BUG-10 — the deployed GitHub Pages site loaded nothing

**Status:** fixed and verified against the live URL.

## Observed

`https://pijalu.github.io/panelcraft/` served the page shell but stayed blank.
The deploy workflow reported success, so the failure was silent.

## Cause

The Pages workflow ran a plain `npm run build`, so Vite used its default base of
`/`:

    src="/assets/index-CvsY1NU-.js"
    href="/assets/index-aqEWDPVn.css"

A GitHub Pages *project* site is served from `/<repo>/`, so those URLs resolve to
`https://pijalu.github.io/assets/…` — the domain root — and 404. Measured
directly:

    curl -o /dev/null -w '%{http_code}' https://pijalu.github.io/assets/index-CvsY1NU-.js
    404

Everything else in the bundle was already relative (`./manifest.webmanifest`,
`./icons/…`) and the service worker derives its scope from `baseURI`, so the base
was the only wrong piece.

## Fix

`.github/workflows/pages.yml` builds with the project sub-path and refuses to
publish a bundle that still points at the domain root:

    - name: build for the project sub-path
      run: npm run build -- --base=/${{ github.event.repository.name }}/
    - name: the bundle must not point at the domain root
      run: |
        if grep -qE '(src|href)="/assets/' web/dist/index.html; then
          echo '::error::index.html references /assets — Pages serves /<repo>/ and would 404'
          exit 1
        fi

`pages.yml` also watches its own file now, so a fix to the workflow itself
triggers a deploy.

## Verification

Guard proven both ways before pushing:

- root-base build (the old behaviour) → guard fires;
- sub-path build → guard passes, `src="/panelcraft/assets/index-C5BLS1MM.js"`.

After the deploy (run 43766065122, success), against the live site:

    $ curl -s https://pijalu.github.io/panelcraft/ | grep -o 'src="/panelcraft/assets/[^"]*"'
    src="/panelcraft/assets/index-C5BLS1MM.js"
    $ curl -o /dev/null -w '%{http_code} %{size_download} bytes' https://pijalu.github.io/panelcraft/assets/index-C5BLS1MM.js
    200 772088 bytes
    manifest: 200
    sw.js: 200

Booted in a real browser (Playwright, chromium) against the live URL: app menu
visible, canvas visible, **zero** 4xx responses, zero failed requests, zero
console errors.

## Residual note

`web/dist` is a build artefact, so the local worktree still builds with the
default base (and must, for the preview server and the e2e suite). The sub-path
base lives only in the Pages workflow.
