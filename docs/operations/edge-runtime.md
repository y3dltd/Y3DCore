---
title: edge runtime
last-reviewed: 2025-04-18
maintainer: TBD
---

# Edge runtime

This directory contains the logic required to create Netlify Edge Functions to support a Next.js
site.

It stands out from the rest of the project because it contains files that run in Deno, not Node.js.
Therefore any files within `edge-runtime/` should not be imported from anywhere outside this
directory.

There are a few sub-directories you should know about.

## `lib/`

Files that are imported by the generated edge functions.

## `shim/`

Files that are inlined in the generated edge functions. This means that _you must not import these
files_ from anywhere in the application, because they contain just fragments of a valid program.

## `vendor/`

Third-party dependencies used in the generated edge functions and pulled in ahead of time to avoid a
build time dependency on any package registry.

This directory is automatically managed by the build script and can be re-generated by running
`npm run build`.

You should not commit this directory to version control.
