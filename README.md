# Readwise embeds

Live, filtered views of your Readwise highlights, sources and daily review (a `readwise` code block), and of your Readwise Reader documents (a `reader` code block). It never edits your notes.

It is not a sync plugin. The official Readwise plugin copies highlights into notes; this one shows them where you ask, always up to date, from a query.

## Setup

1. Get your access token from [readwise.io/access_token](https://readwise.io/access_token).
2. Open **Settings → Readwise embeds**, paste the token into **Readwise access token**, and select **Test connection**.
3. Add a block to a note:

````text
```readwise
search: category:books AND tag:philosophy AND has:note
format: card
limit: 20
```
````

The token lives in Obsidian's secret storage (its keychain), not in the plugin's `data.json`. You can pick a secret you already saved there; if exactly one stored secret has "readwise" in its name, the plugin selects it for you (it reads secret names, never values).

## Block reference

One `key: value` line each. Only `search` is commonly needed.

| Key | Default | Values |
| --- | --- | --- |
| `view` | `highlights` | `highlights`, `books`, `review` |
| `search` | none | A filter (below). Ignored for `review`. |
| `sort` | `-highlighted_at` | `highlighted_at`, `updated`, `title`, `author`, `num_highlights` (books view); a `-` prefix means descending |
| `format` | setting (`list`) | `list`, `table`, `quote`, `card` |
| `limit` | setting (`50`) | 1–500 |
| `showNotes`, `showTags`, `showSource` | `true` | `true`, `false` |
| `group` | none | `book`, `category` (`category` only for the books view) |
| `date` | none | `YYYY-MM-DD`: only highlights from that day. For daily notes, fill it in from your template (`date: {{date:YYYY-MM-DD}}`). Combines with `search`. Ignored for `review`. |
| `size` | `0` | Card format only. `0` keeps full-width cards; 120–800 lays cards out in a grid whose columns are at least that many pixels wide, cover on top. |
| `warnings` | `true` | `false` hides notices under the block (bad keys, layout notes). Filter errors still show. |

### Formats

- **list**: compact rows.
- **table**: one row per highlight or book.
- **quote**: each highlight as a blockquote, its note beneath, source and date in a footer.
- **card**: full-width cards. For highlights, the text up front with a stripe in the highlight's colour. For the `books` view, a document card in the style of Reader's library: title, author, category, highlight count and last highlight date, with a cover image if you turn on **Load cover images**.

`quote` is for highlights; on the `books` view it shows a list.

### Filter

```text
category:books AND author:Le Guin AND has:note AND highlighted__after:"3 months ago"
```

Terms are `field:value`, or `field__operator:value`. Combine with `AND` (optional between terms), `OR`, `NOT` and parentheses. Values can contain spaces (`author:Le Guin`) and end at `AND`, `OR`, `)` or the next `field:`; use quotes to be explicit.

| Field | Matches | Operators |
| --- | --- | --- |
| `category`, `source`, `title`, `author` | The book | `:` (contains), `__exact`, `__contains`, `__not` |
| `text`, `note`, `color` | The highlight | same |
| `tag` | Highlight tags and book tags | same |
| `highlighted`, `updated` | `highlighted_at`, `updated_at` | `__before`, `__after` |
| `has` | `has:note`, `has:tags` | `:`, `__not` |
| `favorite`, `discarded` | `true` or `false` | `:`, `__not` |

Dates are absolute (`2026-03-20`, local midnight) or relative (`"3 months ago"`, `"8 days"`).

A mistake shows an error under the block with the position and, for a misspelt field, the nearest real one. A broken filter never shows an unfiltered list.

In the `books` view a filter keeps books with at least one matching highlight, and the count shows only the matches.

If a note in your vault has a frontmatter property equal to the book's Readwise id, a **note** link appears after the source (or, in `reader` blocks, after the title, matched on the document's Reader id) and opens that note. The property is `id` by default (what the official Readwise plugin writes); change it, or turn the links off, in **Settings → Readwise embeds**. Hold Ctrl or Cmd to open it in a new tab. Nothing is written to the note.

## Reader documents

A `reader` block lists documents from Reader (inbox, later, shortlist, archive), whether or not they have highlights. It uses the same token.

````text
```reader
search: in:later tag:css AND saved__after:"2 weeks ago"
sort: -saved_at
format: card
limit: 25
```
````

| Key | Default | Values |
| --- | --- | --- |
| `preset` | none | `inbox`, `later`, `shortlist`, `archive`, `feed`, `recent` (saved in the last 7 days), `unread`, `long-reads` (20+ minutes), `daily` (everything but RSS items; pair it with `date`). A named filter; `search` narrows it further. |
| `date` | none | `YYYY-MM-DD`: only documents saved that day. For daily notes, fill it in from your template (`date: {{date:YYYY-MM-DD}}` in Templater or core Templates). Combines with `preset` and `search`. |
| `search` | none (every document in your library, feed excluded) | Reader-style filter (below) |
| `sort` | `-saved_at` | `saved_at`, `updated_at`, `published_date`, `title`, `author`, `word_count`, `reading_progress`; a `-` prefix means descending |
| `format` | setting (`list`) | `list`, `table`, `card` |
| `columns` | `title, author, site, saved` | Table only: `title`, `author`, `site`, `category`, `location`, `words`, `time`, `progress`, `saved`, `published`, `tags` |
| `limit` | setting (`50`) | 1–500 |
| `showTags` | `true` | `true`, `false` |
| `showSummary` | `false` | `true`, `false` |
| `group` | none | `location`, `category`, `site` |
| `size` | `0` | Card format only. `0` keeps full-width cards; 120–800 lays cards out in a grid whose columns are at least that many pixels wide, cover on top. |
| `warnings` | `true` | `false` hides notices under the block, including the "first N documents" cut-off notice. Filter errors still show. |

The grammar is the same as for highlights (`AND`, `OR`, `NOT`, parentheses, quotes, `__not`, relative dates). Fields:

| Field | Matches | Operators |
| --- | --- | --- |
| `in`, `location` | `new` (also `inbox`), `later`, `shortlist`, `archive`, `feed` | string |
| `category`, `type` | `article`, `email`, `rss`, `pdf`, `epub`, `tweet`, `video`, … | string |
| `tag`, `title`, `author`, `url`, `domain`, `saved_using` | text | `:` (contains), `__exact`, `__contains`, `__not` |
| `saved`, `published`, `last_opened`, `last_status` | dates | `__before`, `__after` |
| `words`, `minutes`, `progress` | numbers (`progress` is a percentage) | `:`, `__gt`, `__gte`, `__lt`, `__lte`, `__not` |
| `seen`, `unseen`, `feed` | `true` or `false` | `:`, `__not` |
| `has` | `has:notes`, `has:tags` | `:`, `__not` |

`shared`, `saved_count`, `rss_source` and anything that needs a document's highlights (`has:highlights`) are not available from the API or not built yet; using them shows an error instead of being ignored.

How it fetches: each location (inbox, later, shortlist, archive; the feed only if the filter mentions `feed`) is downloaded once, and the whole filter then runs on the saved copy. An `in:` term only chooses which locations to look at. After the first download, a refresh asks Reader only for documents changed since the last sync (a few requests), so new saves, moves, tags and reading progress arrive quickly. Reader never reports deleted documents, so each location is downloaded in full again once a week; use **Reload everything from Readwise** to do it sooner. Highlight and note entries are hidden unless the filter asks for that category. Reader allows 20 requests a minute across all blocks; requests queue, a rate limit is waited out page by page rather than restarting, and blocks that need the same location share one sync. A first download stops at **Maximum pages per query** (100 documents a page, default 10) per location; when that cuts a result short, the block says so.

The copy is saved to `reader-cache.json` in the plugin folder (same setting and privacy note as below), so restarting Obsidian shows results immediately and syncs only changes.

## Panes

- **Readwise library** (ribbon icon, or the command **Open Readwise library**) and **Reader library** (**Open Readwise documents**): panes for browsing without writing a block. The Readwise pane has tabs for Highlights, Sources (the books view) and Daily review, with a type menu (books, articles, tweets, podcasts, supplementals); the Reader pane has Inbox, Later, Shortlist, Archive and Feed; a filter box that takes the same syntax as a block; a layout menu; and, for cards, a size slider. It shows the same data as your blocks, from the same saved copy, with the same **Note** links.
- **Open Reader website** and **Open Readwise website**: Reader (read.readwise.io) or the main Readwise site (readwise.io) in a pane, signed in once for both, separately from the plugin and kept signed in. Desktop only; elsewhere the pane offers a link to open it in your browser. This is the real Reader, so reading, highlighting and triage happen there; the plugin does not read what you do in it.

## Refreshing

- Blocks refresh in the background every **Refresh interval** minutes (minimum 5), while the note is open. Each block has a refresh button.
- Command **Refresh blocks in this note**.
- Command **Reload everything from Readwise** throws away what is held (highlights and Reader documents) and downloads again; use it if a deleted highlight lingers.
- The first block in a session downloads your whole library (shown as a count while it runs). After that, only what changed is fetched, and every block filters the same copy, so ten blocks cost one request. The copy is also saved to `cache.json` in the plugin folder (see below), so restarting Obsidian only fetches what changed.
- If Readwise rate-limits a request, the block shows a countdown, keeps the old results visible, and retries when told to.

## Network and privacy

- The plugin contacts only `readwise.io` (the Readwise v2 and Reader v3 APIs), over HTTPS. The website panes load read.readwise.io or readwise.io, but only when you open it. The token is sent only in the `Authorization` header. There is no telemetry.
- **Keep a copy of your library on disk** is on by default. It saves your highlight text to `cache.json`, and your Reader documents (titles, authors, tags, notes, summaries) to `reader-cache.json`, in this plugin's folder inside your vault so restarts are fast. If you sync or publish that folder, turn the setting off (doing so deletes the file); the same goes for `data.json`. The token itself is not in either file.
- **Load cover images** is off by default. When on, cards load images directly from the sites they came from (without a referrer), which tells those sites your address.

## Install (beta)

Not yet in the community plugin list. Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat): add the beta plugin `kieranmansfield/readwise-embeds`, then enable **Readwise embeds**. Works on desktop and mobile; no desktop-only features are used.

Known gaps: the daily review and Reader response shapes (tags, `reading_time`, published dates) have not been checked against live data, and Reader's filter syntax is only partly documented, so edge cases may differ from Reader itself.

## Development

```bash
pnpm install
pnpm dev     # watch
pnpm build   # type-check and bundle
pnpm test
```

MIT licensed.
