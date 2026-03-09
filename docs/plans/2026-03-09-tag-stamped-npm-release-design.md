# Tag-Stamped npm Release Design

Date: 2026-03-09

## Goal
Make `f1aire` follow the same production npm versioning pattern used in `viberun`:

- Keep the repo `package.json` version at `0.0.0`.
- Treat the git tag (for example `v0.1.6`) as the release version source of truth.
- Stamp the publishable npm package from the tag during CI rather than requiring `package.json` to match.

## Non-Goals
- Adding main-branch dev builds or npm `dev` dist-tags.
- Reworking the entire release workflow beyond the npm versioning path.
- Changing the app’s runtime behavior based on dev/prod version strings.

## Current State
- `package.json` currently contains `0.1.4`, while the latest repo tag is already `v0.1.5`.
- `.github/workflows/publish.yml` still hard-fails unless `package.json` equals the pushed tag version.
- `viberun` solves this by keeping a template `package.json` at `0.0.0` and stamping a staged publish directory from the release tag during packaging.

## Proposed Approach
Adopt the `viberun` packaging model, but only for tagged production releases.

1. Set the repo `package.json` version to `0.0.0`.
2. Add a small packaging script that:
   - copies the npm payload into a staging directory
   - rewrites the staged `package.json` version from `VERSION`
3. Update the publish workflow to:
   - verify the pushed ref is a `v*` tag
   - build/test as usual
   - run the packaging script with `VERSION=${GITHUB_REF_NAME}`
   - pack/publish from the staged output
4. Remove the old “tag must equal package.json” check because the tag is now the only release authority.

## Packaging Model
The staged npm directory should contain only the files meant for publish:

- built `dist/`
- `README.md`
- staged `package.json`

The staging step keeps release-time mutation out of the repo checkout and makes it easy to validate what will actually be published.

## Validation
The workflow should validate:

- `VERSION` is present and starts with `v`
- staged `package.json` gets the stripped semver value (for example `0.1.6`)
- `npm pack` runs against the staged directory, not the repo root

## Release Bump
After the workflow change lands, the next patch release should be cut from the latest existing tag:

- latest tag: `v0.1.5`
- next patch tag: `v0.1.6`

That tag should trigger the updated publish workflow.

## Risks
- If the workflow still packs from the repo root, npm will publish `0.0.0`; the staging path must be explicit.
- If `VERSION` parsing is loose, malformed tags could generate invalid package versions.
- The repo version will no longer indicate the current release version locally; this is intentional and should be documented by the workflow itself.
