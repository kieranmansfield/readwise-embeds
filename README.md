# Readwise embeds

Live, filtered views of your Readwise highlights, sources and daily review, drawn from a `readwise` code block. Nothing is written to your vault.

It is not a sync plugin. The official Readwise plugin copies highlights into notes; this one shows them where you ask, always up to date, from a query.

Design reference: [obsidian-raindrop](https://github.com/mtopping/obsidian-raindrop).

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

The token lives in Obsidian's secret storage, not in the plugin's `data.json`.

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

## Refreshing

- Blocks refresh in the background every **Refresh interval** minutes (minimum 5), while the note is open. Each block has a refresh button.
- Command **Refresh blocks in this note**.
- Command **Reload the whole library** throws away what is held and downloads everything again; use it if a deleted highlight lingers.
- The first block in a session downloads your whole library (shown as a count while it runs). After that, only what changed is fetched, and every block filters the same copy, so ten blocks cost one request. The copy is held in memory only, so restarting Obsidian downloads it again.
- If Readwise rate-limits a request, the block shows a countdown, keeps the old results visible, and retries when told to.

## Network and privacy

- The only host contacted is `readwise.io`, over HTTPS. The token is sent only in the `Authorization` header. There is no telemetry.
- Highlight text is held in memory while Obsidian runs and is not written to disk.
- **Load cover images** is off by default. When on, cards load images directly from the sites they came from (without a referrer), which tells those sites your address.

## Status

Early. The daily review response shape has not been checked against live data. Not yet in the community plugin list; install with [BRAT](https://github.com/TfTHacker/obsidian42-brat) from this repository.

## Development

```bash
pnpm install
pnpm dev     # watch
pnpm build   # type-check and bundle
pnpm test
```

MIT licensed.
