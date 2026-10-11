# Obsidian Readwise plugin: development plan

Working name: `obsidian-readwise`. Written 2026-10-11.

## 1. Overview and goals

A read-only Obsidian plugin that turns a `readwise` codeblock into a live, filtered view of your Readwise highlights, sources or daily review, modelled on [obsidian-raindrop](https://github.com/mtopping/obsidian-raindrop). Readwise has no official filter language, so the block's `search:` line uses a small grammar of our own, with the same shape as Reader's filter syntax so the two plugins feel alike.

The plugin is done when:

1. Pasting an access token and writing one block is enough to see results.
2. A filter written in the grammar below returns the highlights you expect.
3. Many blocks in one vault stay inside the API rate limits.
4. Nothing is written to the vault, and nothing leaves it except calls to readwise.io.

A separate plan covers the Reader plugin (`reader-plugin-plan.md`). The two share design and copied code, but not a repository.

## 2. Scope

**In scope for v1**

- Three views: highlights, books (sources) and the daily review.
- A filter grammar, list, table and quote formats, tags, notes, sort, row limit, background refresh.
- Settings: access token with a connection test, refresh interval.
- Desktop and mobile (`isDesktopOnly: false`, as in obsidian-raindrop).

**Deferred or out of scope**

- Creating, editing, tagging or deleting highlights, and marking a daily review complete (the API supports all of these; they add write-safety work).
- Syncing highlights into notes. The official Readwise plugin already does that; this plugin is for live query blocks.
- OAuth. Like obsidian-raindrop, a personal token avoids running any middleware.

## 3. Prior art: obsidian-raindrop

We keep its user-facing design and replace its internals. This comparison rests on its README, `main.ts`, `manifest.json` and `package.json`; its `src` folder could not be fetched, so the Svelte components are inferred from imports.

| Aspect | obsidian-raindrop | This plugin |
| --- | --- | --- |
| Entry point | `registerMarkdownCodeBlockProcessor("raindrop", …)` | Same, with `readwise` |
| Block syntax | `key: value` lines | Same style, parsed line by line |
| Parsing | One regex per key (`key:(.*)`) run over the whole source | A line parser that splits on the first `:`, so a value containing `sort:` cannot be read as a key |
| Auth | Personal test token pasted into settings | Personal access token from readwise.io/access_token |
| Refresh | Interval setting, default 60 minutes | Same setting, plus a cache that shows stale data while refetching |
| UI | Svelte components with svelte-query | Plain TypeScript DOM code and a small cache; no framework |
| Build | esbuild 0.13, node-sass, Svelte 3 | Current esbuild and TypeScript; no Sass |
| Search | Raindrop search syntax sent to the API | Filter grammar implemented client-side |
| Licence | MIT | MIT; attribution kept if any code is copied |

## 4. Architecture and layout

```text
obsidian-readwise/
  manifest.json  versions.json  version-bump.mjs  styles.css
  package.json  tsconfig.json  esbuild.config.mjs  eslint config
  src/
    main.ts              plugin class: settings, processor, commands
    settings.ts          settings model and tab
    block/params.ts      codeblock source -> typed params
    api/http.ts          requestUrl wrapper, auth, error types
    api/readwise.ts      export, review, highlights and books endpoints
    api/types.ts         response types
    cache/cache.ts       in-memory + persisted cache, in-flight sharing, merge by id
    cache/limiter.ts     per-endpoint rate limiter
    filter/tokenize.ts   filter string -> tokens
    filter/parse.ts      tokens -> AST
    filter/fields.ts     field table: accessors, types, operators
    filter/dates.ts      absolute and relative date parsing
    filter/evaluate.ts   AST -> predicate
    render/view.ts       block lifecycle (MarkdownRenderChild)
    render/list.ts       list format
    render/table.ts      table format
    render/quote.ts      quote format
  tests/                 Vitest, fixtures taken from the API examples
```

The tokenizer, parser, dates, cache, limiter and renderer shell are copies of the Reader plugin's; only the API client and the field table differ.

Request path for one block:

1. Obsidian calls the processor with the block source.
2. `params.ts` parses it into typed parameters; errors render inline.
3. `parse.ts` builds the filter AST.
4. The cache returns fresh data, or stale data now plus a background refetch; identical in-flight requests share one fetch.
5. `evaluate.ts` filters the highlights or books, then the block sorts and truncates them.
6. The renderer draws the chosen format and schedules the next refresh.

## 5. Shared internal modules

Only the HTTP client and the view touch Obsidian.

| Module | Responsibility | Design notes |
| --- | --- | --- |
| `api/http.ts` | Authenticated requests to readwise.io | Uses Obsidian's `requestUrl` (no CORS problem, works on mobile). Header `Authorization: Token …`. Throws typed errors: auth (401/403), rate limited (429 with `Retry-After`), not found (the daily review returns 404 when none exists), server, network. The fetcher is injected so tests need no Obsidian. |
| `cache/limiter.ts` | Keep each endpoint under its limit | Token bucket per endpoint group: highlights and books list 20/min, everything else 240/min. Callers queue instead of failing. A 429 pauses the bucket for `Retry-After`. |
| `cache/cache.ts` | Avoid repeat calls | Key is the normalised request. Entries carry `fetchedAt`: fresh inside the refresh interval, stale after. Stale entries render at once while a refetch runs. Identical in-flight requests share one promise. Export results merge by id on refresh. Persisted in the plugin's data so a restart does not refetch. |
| `settings.ts` | Token, interval, defaults | `loadData` and `saveData`; numbers are validated instead of storing `NaN`. |
| `block/params.ts` | Block source to typed parameters | Splits each line on the first `:`. Unknown keys produce a visible warning, not silence. |
| `render/view.ts` | Block lifecycle | A `MarkdownRenderChild`, so timers and listeners go away when the block leaves the page. Refresh runs on `registerInterval`. |

## 6. Readwise data layer

The plugin uses the v2 API. The export endpoint is the default source because it returns whole books with their highlights nested, cursor paged, and is not among the endpoints limited to 20 requests a minute.

| Need | Endpoint | Notes |
| --- | --- | --- |
| Bulk data | `GET /api/v2/export/` | Returns books with their highlights nested. Takes `updatedAfter`, `ids` and `includeDeleted`. |
| Narrow lookups | `GET /api/v2/highlights/`, `GET /api/v2/books/` | Up to 1,000 per page; filters by dates, `book_id`, `category` and `source`; limited to 20 requests a minute. |
| Daily review | `GET /api/v2/review/` | The latest review's highlights; 404 if none exists. |
| Token check | `GET /api/v2/auth/` | 204 means the token is valid. |

The export response carries each highlight's text, note, colour, tags, `highlighted_at`, `is_favorite`, `is_discard` and `readwise_url`, plus the book's category, source, tags and note. That covers every view without a second request.

**Fetch strategy**

1. First use: page through the export with `pageCursor` until the cursor is empty, and store the books and highlights.
2. Later refreshes: call the export with `updatedAfter` set to the last fetch and `includeDeleted=true`, merge by id, and drop anything marked deleted.
3. Every block then filters the cached data locally, so any number of blocks costs no extra requests.
4. The `review` view fetches `GET /api/v2/review/` on its own, and treats a 404 as "no review today".

**Cost.** The export returns whole books, so the first vault-wide query downloads the entire library. Show progress while it runs, and keep the result in the persisted cache. Offer "Persist cache between sessions" in settings for people who do not want highlight text stored in the plugin's data file.

## 7. Filter grammar

Same tokenizer and parser as the Reader plugin; only the field table differs.

```text
query   := or
or      := and ( "OR" and )*
and     := unary ( ["AND"] unary )*
unary   := "NOT" unary | "(" or ")" | term
term    := field [ "__" operator ] ":" value
value   := quoted | words
quoted  := '"' … '"'
words   := text up to AND, OR, ")" or the start of the next term
```

Values can contain spaces without quotes (`author:Le Guin`); a value ends only at `AND`, `OR`, a closing parenthesis, or a token shaped like `field:`.

**Operators**

| Operator | Applies to | Meaning |
| --- | --- | --- |
| none (`:`) | strings | Case-insensitive match on tokens and substrings |
| `__exact` | strings | Whole value equals, case-insensitive |
| `__contains` | strings | Substring |
| `__before` `__after` | dates | Earlier or later than the date |
| `__not` | any | Negates the term |

**Fields**

| Field | Reads | Operators |
| --- | --- | --- |
| `category` | book `category`: `books`, `articles`, `tweets`, `podcasts`, `supplementals` | `:`, `__not` |
| `source` | book `source` (for example `kindle`, `reader`) | `:`, `__exact`, `__not` |
| `title`, `author` | book title and author | string operators |
| `text`, `note` | highlight text, highlight note | string operators |
| `tag` | highlight tags and book tags | `:`, `__exact`, `__not` |
| `color` | highlight colour | `:`, `__not` |
| `highlighted`, `updated` | `highlighted_at`, `updated_at` | `__before`, `__after` |
| `has:note`, `has:tags` | non-empty | none |
| `favorite`, `discarded` | `is_favorite`, `is_discard` | binary |

**Dates.** Absolute (`2026-03-20`) and relative (`"3 months ago"`, `"8 days"`), as in the Reader plugin. Relative dates use the clock at evaluation time; absolute dates mean local midnight.

**Errors.** A syntax error renders inline with its position and the expected token. An unknown field is named, with the nearest known field suggested. A block never falls back to an unfiltered list on error.

**Example.** `category:books AND author:Le Guin AND has:note AND highlighted__after:"3 months ago"`

Unlike Reader's syntax, this grammar is ours to define, so there is no parity risk; the field table can grow as people ask for fields.

## 8. Block specification

A block is `key: value` lines, and only `search` is commonly needed. Keys follow obsidian-raindrop's naming wherever the meaning is the same.

| Key | Default | Values | Effect |
| --- | --- | --- | --- |
| `view` | `highlights` | `highlights`, `books`, `review` | What to list |
| `search` | none | Filter string (section 7) | Filter; ignored for `review` |
| `sort` | `-highlighted_at` | `highlighted_at`, `updated`, `title`, `author`, `num_highlights` (books view); a `-` prefix means descending | Sort order, applied locally |
| `format` | `list` | `list`, `table`, `quote` | Display format |
| `limit` | `50` | 1–500 | Maximum rows displayed |
| `showNotes` | `true` | `true`, `false` | Show each highlight's note |
| `showTags` | `true` | `true`, `false` | Tag chips |
| `showSource` | `true` | `true`, `false` | Source title and author |
| `group` | none | `book`, `category` | Group headings |

Example (the lines inside a `readwise` fence):

```text
view: highlights
search: category:books AND tag:philosophy AND has:note
sort: -highlighted_at
format: quote
limit: 20
```

**Rendering.** The `quote` format draws each highlight as a blockquote with its note beneath, the source and location in a footer, and the title linked to the Readwise URL. `list` and `table` are compact versions of the same data. The `books` view shows each source with its category, highlight count and last highlight date. All classes are prefixed `rw-` and use theme CSS variables, so light, dark and community themes work.

**States.** Loading shows a skeleton (and progress during the first export). Empty shows "No highlights match" with the parsed filter. A rejected token links to settings. Rate limiting shows a countdown and keeps stale results visible. No daily review shows "No review available". Filter errors render inline.

**Controls.** Each block gets a small refresh button, and a command refreshes every block in the active note. Blocks refresh in the background on the interval, only while their note is open.

## 9. Settings and security

| Setting | Default | Notes |
| --- | --- | --- |
| Access token | empty | Masked input. A "Test connection" button calls `GET /api/v2/auth/` and reports success or the error. |
| Refresh interval (minutes) | 60 | Same as obsidian-raindrop. Minimum 5, so a typo cannot exhaust the rate limit. |
| Default format and limit | `list`, 50 | Used when a block leaves them out. |
| Persist cache between sessions | on | Turn off to keep highlight text out of the plugin's data file. |
| Debug logging | off | Logs requests, cache hits and limiter waits; never the token. |

**Token.** Readwise issues one access token (readwise.io/access_token) that works for both the Readwise and Reader APIs. By default it sits in plain text in the plugin's `data.json` inside the vault, as obsidian-raindrop's does. The README must warn against syncing or publishing the plugin folder. Check whether the current Obsidian API offers a secret-storage facility, and use it if so.

**Network.** The only host contacted is `readwise.io`, over HTTPS, and the token travels only in the `Authorization` header. There is no telemetry. Obsidian's community plugin rules expect the README to disclose network use.

## 10. Tooling and build

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict` | The filter AST and API types gain the most from the compiler |
| Bundler | Current esbuild, with `obsidian` and Node built-ins external | Standard for plugins; replaces obsidian-raindrop's esbuild 0.13 |
| Tests | Vitest | Parser, evaluator and cache are pure TypeScript; fake timers cover the limiter |
| Lint and format | ESLint (with the Obsidian plugin ruleset if it is still published), Prettier | Catches review findings before submission |
| Package manager | npm or pnpm, lockfile committed | Reproducible builds |
| Scripts | `dev`, `build` (type-check, then bundle), `test`, `lint`, `version` | `version` runs `version-bump.mjs`, which updates `manifest.json` and `versions.json` |
| CI | GitHub Actions: lint, test and build on every pull request | A release workflow attaches `main.js`, `manifest.json` and `styles.css` to a tag |
| Styling | One `styles.css` with theme variables and prefixed classes | No Sass, no build step |

There is no UI framework. The views are a few hundred lines of DOM code, and dropping Svelte also drops the old toolchain obsidian-raindrop carries, node-sass in particular.

## 11. Testing strategy

**Automated (Vitest, run in CI)**

- Tokenizer and parser: table-driven cases, including `category:books AND author:Le Guin AND has:note`, nested parentheses, `NOT`, quoted values and malformed input (unbalanced parentheses, unknown fields, empty values).
- Evaluator: fixture books and highlights built from the example responses in the API docs, with a fixed clock for relative dates.
- Cache merge: an incremental export with updated and deleted highlights produces the right set.
- Cache and limiter: fake timers; checks for stale-while-revalidate, in-flight sharing, the 429 pause and `Retry-After`.
- API client: a mocked fetcher returning fixtures, including 401, 404 (no daily review), 429 and cursor paging.
- Params parser: keys, defaults, unknown-key warnings.

**Contract check (manual, not in CI).** An `npm run contract` script calls the real API with a token from the environment and compares response shapes with the types, including a check of the export's `updatedAfter` and `includeDeleted` behaviour.

**Manual checklist in a test vault**

- Bad token, no token, offline, empty result, no daily review, and a forced 429.
- Ten blocks in one note make no more than one export request between them.
- A large library: first load shows progress, and later loads come from the cache.
- Light and dark themes, plus one community theme.
- Live Preview and Reading mode; switching notes leaves no timers behind.
- iOS and Android: layout, link opening and refresh.

## 12. Milestones

Sizes are relative (S, M, L), not calendar estimates. This plugin is built after the Reader plugin so it can copy its core.

| Phase | Deliverable | Done when | Size |
| --- | --- | --- | --- |
| 0. Spikes and scaffold | Repo from template; a live-API check of the export's `updatedAfter` and `includeDeleted` behaviour, tag shapes and category values | Plugin loads in a test vault; findings are written into section 13 | S |
| 1. Foundation | Core copied from the Reader plugin; export client, cache with merge, settings with connection test, params parser, a `readwise` block with the `highlights` view and list format | A block lists highlights and survives a 429 | M |
| 2. Grammar and views | Field table, evaluator wiring, `books` and `review` views, inline error rendering | Every example filter in the tests passes | M |
| 3. Formats and polish | Table and quote formats, sort, group, states, refresh controls, styles, README | The manual checklist passes | M |
| 4. Hardening and beta | Mobile testing, large-library test, accessibility pass, release workflow, BRAT beta | The beta installs from GitHub and runs on desktop and mobile | M |
| 5. Later options | Mark review complete, create or tag highlights, community submission | Chosen after beta feedback | M |

## 13. Risks and open questions

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| First export of a large library is slow and large | Long first load, big data file | Progress indicator, incremental refresh, the persist-cache setting |
| Highlight text stored in the plugin's data file | Private text lands in the vault's plugin folder | Setting to turn off persistence; README note |
| Token stored in plain text | Leak if the vault is synced or published | README warning; secret storage if the Obsidian API offers it |
| Incremental merge misses a deletion | Removed highlights keep showing | `includeDeleted=true` on refresh; a "full refresh" command |
| Overlap with the official Readwise plugin | Confusion about purpose | The README states the difference: live query blocks, nothing synced into the vault |
| API changes | Breakage | Typed responses, the contract script, tolerant parsing of unknown fields |

**Verify against live data or current docs before relying on them**

1. How `updatedAfter` interacts with deleted highlights when `includeDeleted` is set.
2. The shape of tags on books and on highlights in the export response.
3. The full list of `source` values, so the `source` field documents real ones.
4. Whether the export has its own rate limit, and its current value.
5. Obsidian's secret-storage API and the minimum app version for the APIs used.
6. The community directory's naming rules for plugin ids and names.

**Assumptions to confirm:** a separate repo for this plugin, and read-only blocks for v1.

## 14. Release and distribution

Beta through BRAT from GitHub releases first, then a submission to the community plugin directory.

1. **Manifest.** `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `authorUrl`, `isDesktopOnly: false`. Set `minAppVersion` to the lowest version that has every API used. The working name is `obsidian-readwise`; the final id follows the directory's naming rules and must not clash with the official Readwise plugin.
2. **Versioning.** Semantic versions. `npm version` runs `version-bump.mjs`, which updates `manifest.json` and `versions.json` (the map from plugin version to minimum Obsidian version).
3. **GitHub release.** Each tag attaches `main.js`, `manifest.json` and `styles.css`, built by the release workflow.
4. **README.** Install steps, where to get the token, the block reference with examples, the filter field table, rate-limit behaviour, the network and token disclosures, the data-persistence setting, and how it differs from the official Readwise plugin.
5. **Beta.** Install through BRAT, then collect mobile issues and missing fields.
6. **Submission.** A pull request to the Obsidian releases repository adds the plugin to the community list; address the review findings.
7. **Licence and credit.** MIT. The README credits obsidian-raindrop as the design reference, and any copied code keeps its copyright notice.

## Sources

- [mtopping/obsidian-raindrop](https://github.com/mtopping/obsidian-raindrop)
- [Readwise API](https://readwise.io/api_deets)
- [Reader API](https://readwise.io/reader_api)
