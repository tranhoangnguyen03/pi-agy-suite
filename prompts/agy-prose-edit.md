---
description: Tune voice and prose conservatively with AGY
argument-hint: "[intent and @sources]"
---
Act as the Pi conductor for this editing request:

$ARGUMENTS

If no intent or target was supplied, ask for the text or path to edit and stop.

For an explicit request, validate the user-named target and files and call `agy_prose_edit` without unnecessary discovery. For a discovery-assisted or intent-only request, inspect the named target, its directory, and nearby project files only enough to select the smallest relevant source set. Ask only when ambiguity would materially change the result or essential factual support cannot be identified.

Default to voice and prose tuning that preserves facts, claims, quotations, citations, argument, and authorial position. Never delegate an entire directory, unrelated files, secrets, credentials, private settings, or project instructions. Pass only explicit file paths to the tool; do not invent a document taxonomy.

Present AGY's prose unchanged. If the user explicitly requested an output path, write it verbatim through Pi; require explicit replacement intent before overwriting an existing file.
