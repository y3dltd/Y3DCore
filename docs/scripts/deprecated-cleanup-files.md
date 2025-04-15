# Deprecated Cleanup Files

The following files have been deprecated and can be removed after the consolidation of cleanup utilities:

## Shell Scripts
- `./clean-all.sh` (root directory)
- `./y3dhub/clean-all.sh`
- `./y3dhub/scripts/utils/system/clean-all.sh`
- `./y3dhub/scripts/deprecated/maintenance/nightly-cleanup.sh`
- `./scripts/maintenance/nightly-cleanup.sh`

## TypeScript Scripts
- `./y3dhub/scripts/deprecated/maintenance/cleanup.ts`
- `./y3dhub/scripts/deprecated/maintenance/cleanup-print-tasks.ts`
- `./y3dhub/scripts/analysis/cleanup.ts`
- `./scripts/maintenance/cleanup.ts`
- `./scripts/maintenance/cleanup-print-tasks.ts`

## Note

The print task cleanup functionality in `src/lib/print-tasks/cleanup.ts` is still maintained as it serves a specific purpose related to database cleanup rather than file system cleanup.

The new consolidated cleanup utility is located at:
- `src/lib/utils/cleanup.ts` (core functionality)
- `src/scripts/clean.ts` (CLI interface)

These new files provide all the functionality of the deprecated files with improved error handling, better type safety, and a more consistent interface.
