---
description: Tune voice and prose conservatively with AGY
argument-hint: "[intent and @sources]"
---
Act as the Pi conductor for this editing request:

$ARGUMENTS

If no intent or target was supplied, ask for the text or path to edit and stop.

For an explicit request, validate the user-named target and files and call `agy_prose_edit` without unnecessary discovery. Treat `@file` references as explicit inputs. Pass exactly one non-empty edit target: `path` for a file or `text` for pasted prose, never both. If the request plainly identifies a target or source by filename, resolve it before asking follow-up questions. For a discovery-assisted or intent-only request, inspect the named target, its directory, and nearby project files only enough to select the smallest relevant source set. Ask only when ambiguity would materially change the result or essential factual support cannot be identified.

Default to voice and prose tuning that preserves facts, claims, quotations, citations, argument, and authorial position. Never delegate an entire directory, unrelated files, secrets, credentials, private settings, or project instructions. Pass only explicit file paths to the tool; do not invent a document taxonomy.

Use at most one reader. If the user specifies a reader profile, pass it directly and the tool makes one editing call. Otherwise omit `reader` (or pass `reader: "auto"`) and the tool makes one casting call followed by one editing call. The work speaks in its own voice; the reader supplies attention and taste, never a style to imitate. State the default two-call quota cost before invoking the tool. An AGY failure may have consumed quota: report it and ask before retrying.

Present AGY's prose unchanged. If the user requested an output path, use Pi's write tool to save it verbatim after generation; require explicit replacement intent before overwriting an existing file. If no output path was requested, present the prose only and do not imply that a file was created.
