# Knowledge sources

Knowledge indexing copies selected source text into the portal's local SQLite
database for full-text search. Source content is untrusted data, never an
instruction or authority to execute tools. Indexing does not send local notes to
a model. The index contains readable document text; encrypted connector
credentials do not encrypt the search index. Keep the portal's data directory
private and remove a connector to remove its indexed documents.

## Local folders and Obsidian

Configure the absolute path of a folder on the machine running the portal server.
The local folder mode reads `.md`, `.mdx`, `.txt`, and `.json`; Obsidian mode reads
only `.md` notes. Hidden files and directories, including `.obsidian`, are outside
the indexed scope. Obsidian plugins, attachments, backlinks, and vault settings
are not imported. Wiki links remain source text.

Each document retains an encoded `file:` URL and its source modification time.
The operating system or browser may restrict opening local file links; the source
reference still identifies the note. File and directory symbolic links and
Windows junctions inside the selected root are excluded. The configured root is
resolved to its canonical directory. Indexing checks resolved containment and
file identity around reads, but it is not a filesystem snapshot: avoid actively
moving or replacing source directories while syncing.

A sync reads at most 10,000 files, visits at most 50,000 directory entries, descends
32 directory levels, and stores at most 32 MiB of source text. Individual files
must be at most 2 MiB. Binary files and files changing during the read are omitted.
Warnings identify omissions or limits; a partial index is not complete vault
coverage. Hidden files and unsupported extensions are intentional scope exclusions
and do not themselves produce warnings. A successful sync atomically replaces the
connector's index, so deleted notes disappear from search. An unreadable or missing
source clears the previous cache and fails the sync to avoid retaining content
after an access change.

## Notion

Create a Notion internal integration with only **Read content** enabled, then share
the intended pages with that integration in Notion. Enter its integration token
and between 1 and 25 explicit page URLs or UUIDs in the portal. Keep the token in
the credential field; do not put it in a URL or note. Page selection limits the
portal's reads even if the integration has access to more of the workspace.

The portal retrieves only the selected pages and their ordinary nested text
blocks. It does not search the workspace, query databases, follow page mentions,
traverse child pages, or read synced blocks. To index a child page, select that page
explicitly. Attachments, comments, meeting transcripts, unsupported block types,
and non-title page properties are excluded. Tables contribute their cell text.
Unsupported content produces coverage warnings. Documents retain a canonical
Notion page URL, title, and source modification time.

Requests use GET against the fixed `https://api.notion.com` origin with API version
`2026-03-11`; redirects are rejected. Each request has a maximum 10-second timeout.
Each sync is bounded by 60 seconds, 100 requests, 16 levels of nested blocks,
1 MiB per JSON response, 2 MiB of text per page, and 8 MiB of text overall. Requests
are paced at least 350 ms apart within each sync. Pagination is followed within
these limits; repeated or malformed cursors fail validation. Size, traversal, and
request limits produce partial coverage instead of implying a complete export.
An oversized response fails the sync. A rate limit fails without retrying; retry
the sync later. Multiple independent integrations can still encounter provider
limits.

Successful results replace the source index in one database transaction. A failed
transient request preserves the previous snapshot, which remains stale until a
successful sync. Confirmed loss of access takes precedence over that snapshot:
401 or 403 removes all cached documents for the connector; 404 or an archived or
trashed page removes that selected page immediately, including when a later page
fails. Removing a page from the configured scope removes it before further reads.
Access changes are detected on sync, not continuously. Removing the connector
removes its local index immediately. Provider error bodies, transport exceptions,
and tokens are not copied into sync errors.

The backend returns `{ indexed, skipped, partial, warnings }`. `skipped` counts
known omitted files/subtrees or unavailable/unvisited selected pages, not every
document beyond an unvisited directory or nested block. The UI should display
warnings alongside the indexed count and preserve a failed sync's freshness state.

The implementation uses the block API to enforce explicit child-page boundaries.
Notion's markdown endpoint can include unknown or truncated content, so it is not
used to infer complete page coverage.

Official API references checked September 5, 2026:

- [Read content capability and page access](https://developers.notion.com/reference/retrieve-a-page)
- [Paginated block children](https://developers.notion.com/reference/get-block-children)
- [Block types](https://developers.notion.com/reference/block)
- [Request limits](https://developers.notion.com/reference/request-limits)
- [Markdown truncation and permissions](https://developers.notion.com/guides/data-apis/working-with-markdown-content)
