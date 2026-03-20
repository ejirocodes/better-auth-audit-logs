# Phase 6: Feedback & Iteration

During implementation, the user shifts from architect to supervisor. Corrections become terse.

## Accepting Corrections

The user has full context from the plan and session, so short corrections are enough:

- `"You didn't implement the deduplicateByTitle function."`
- `"You built the settings page in the main app when it should be in the admin app, move it."`
- `"wider"` / `"still cropped"` / `"there's a 2px gap"`

## Reference-Based Corrections

When the user references existing code, read that reference before making changes:

- `"this table should look exactly like the users table, same header, same pagination, same row density."`
- `"make the error handling match how we do it in the auth module"`

This communicates all implicit requirements without spelling them out.

## Reverts

If something goes wrong directionally, expect the user to revert via git and re-scope:

- `"I reverted everything. Now all I want is to make the list view more minimal — nothing else."`

Don't try to patch a bad approach. Start clean from the narrowed scope. Narrowing scope after a revert almost always produces better results than incremental fixes.

## Selective Guidance

The user may cherry-pick from proposals or override technical choices:

- `"for the first one, just use Promise.all; for the third one, extract it into a separate function; ignore the fourth and fifth ones"`
- `"remove the download feature from the plan, I don't want to implement this now"`
- `"the signatures of these three functions should not change, the caller should adapt"`
- `"use this library's built-in method instead of writing a custom one"`
