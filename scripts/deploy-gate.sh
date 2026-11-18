#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# deploy-gate.sh — decide whether a revision has anything new to publish.
#
# Usage:
#   bash scripts/deploy-gate.sh --head <sha> [--served <sha>] [--repo <dir>]
#
# Prints exactly one verdict line, `publish=true` or `publish=false`, and the
# reasoning above it. Exit 0 means the verdict is trustworthy either way; a
# non-zero exit means the *decision* failed (bad arguments, missing commit), not
# that the answer is "do not publish" — the caller must not treat an error as a
# skip.
#
# Why this is not "did the last commit touch web/":
#
# The site is a build of some revision. Whether another build is needed is a
# question about the difference between *what is served* and *what we mean to
# publish* — not about the last commit. Comparing the candidate with its parent
# silently drops work whose own publication never happened: a docs-only merge is
# skipped correctly, but any shipped change stranded behind it stays stranded for
# as long as merges keep touching only documentation. That is not hypothetical;
# it left a released bug fix unpublished for two merges.
#
# So the comparison is served..head:
#   - nothing served yet (first publication)      → publish
#   - the site already serves this commit         → skip (idempotent re-run)
#   - served commit unknown to this clone         → publish (see below)
#   - otherwise                                   → publish iff a shipped path differs
#
# An unknown served revision publishes rather than skips. A redundant deploy
# costs one workflow run; a wrongly skipped one is invisible, and invisible is
# how content gets stranded. The same asymmetry applies to a served revision that
# is not an ancestor of head (a rewritten branch): we cannot enumerate the
# difference, so we publish rather than claim there is none.
set -euo pipefail

# Paths whose content ends up in the served bundle or in how it is published.
# Keep in step with `web/**` inputs: a file that ships must be listed here, or a
# change to it alone will be treated as docs-only.
SHIPPED_RE='^(web/|index\.html|vite\.config\.ts|tsconfig|package(-lock)?\.json|\.github/workflows/pages\.yml)'

head=""
served=""
repo="."

while (( $# > 0 )); do
  case "$1" in
    --head) head="${2:-}"; shift 2 ;;
    --served) served="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "deploy-gate: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [[ -z "$head" ]]; then
  echo "deploy-gate: --head <sha> is required" >&2
  exit 2
fi

git_in() { git -C "$repo" "$@"; }

if ! git_in rev-parse --verify --quiet "${head}^{commit}" >/dev/null; then
  echo "deploy-gate: head '$head' is not a commit in '$repo'" >&2
  exit 2
fi
head="$(git_in rev-parse "${head}^{commit}")"

verdict() { echo "publish=$1"; }

if [[ -z "$served" ]]; then
  echo "nothing is served yet — first publication"
  verdict true
  exit 0
fi

if [[ "$served" == "$head" ]]; then
  echo "the site already serves $head — nothing to publish"
  verdict false
  exit 0
fi

if ! git_in rev-parse --verify --quiet "${served}^{commit}" >/dev/null; then
  echo "served revision '$served' is unknown here — publishing rather than assuming it matches"
  verdict true
  exit 0
fi
served="$(git_in rev-parse "${served}^{commit}")"

if ! git_in merge-base --is-ancestor "$served" "$head"; then
  echo "served revision $served is not an ancestor of $head — cannot enumerate the difference, publishing"
  verdict true
  exit 0
fi

changed="$(git_in diff --name-only "$served" "$head")"
echo "files changed between served $served and head $head:"
if [[ -z "$changed" ]]; then
  echo "  (none — the two revisions hold identical trees)"
  verdict false
  exit 0
fi
echo "$changed" | sed 's/^/  /'

if echo "$changed" | grep -qE "$SHIPPED_RE"; then
  echo "shipped paths differ — publishing"
  verdict true
else
  echo "only non-shipped paths differ — nothing to deploy (checks still passed)"
  verdict false
fi
