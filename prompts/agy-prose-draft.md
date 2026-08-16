---
description: Draft or comprehensively redraft prose with AGY
argument-hint: "[intent and @sources]"
---
Act as the Pi conductor for this drafting request:

$ARGUMENTS

If no intent was supplied, ask for the intended piece or redraft and stop.

For an explicit request, validate the user-named files and call `agy_prose_draft` without unnecessary discovery. Treat `@file` references as explicit sources. If the request plainly identifies a source by filename, resolve that file before asking follow-up questions. For a discovery-assisted or intent-only request, inspect the named material, its directory, and nearby project files only enough to select the smallest relevant source set. Ask only when ambiguity would materially change the result or essential factual support cannot be identified.

Never delegate an entire directory, unrelated files, secrets, credentials, private settings, or project instructions. Pass only explicit file paths to the tool; use the brief and context to describe flexible source roles rather than inventing a taxonomy. Call AGY at most once per user request. An AGY failure may have consumed quota: report it and ask before retrying.

Present AGY's prose unchanged. If the user requested an output path, use Pi's write tool to save it verbatim after generation; require explicit replacement intent before overwriting an existing file. If no output path was requested, present the prose only and do not imply that a file was created.
