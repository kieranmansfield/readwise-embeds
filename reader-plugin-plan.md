# Obsidian Readwise Reader plugin: development plan

Working name: `obsidian-readwise-reader`. Written 2026-10-11.

## 1. Overview and goals

A read-only Obsidian plugin that turns a `reader` codeblock into a live, filtered list of Readwise Reader documents, modelled on [obsidian-raindrop](https://github.com/mtopping/obsidian-raindrop). The block's `search:` line uses Reader's own filter syntax, implemented by us because the Reader API has no filter-string parameter.

The plugin is done when:

1. Pasting an access token and writing one block is enough to see results.
2. A filter you already use in Reader works in the block with the same meaning.
3. Many blocks in one vault stay inside the API rate limit (20 requests a minute on the list endpoint).
4. Nothing is written to the vault, and nothing leaves it except calls to readwise.io.

## 2. Scope

**In scope for v1**

- Filter-string search, sort, list and table formats, tags, reading progress, row limit, background refresh.
- Settings: access token with a connection test, refresh interval, page cap.
- Desktop and mobile (`isDesktopOnly: false`, as in obsidian-raindrop).

**Deferred or out of scope**

- Saving URLs, tagging, archiving or editing (the API supports it; it adds write-safety work).
- Creating notes from documents, or syncing content into the vault.
- A local snapshot of the whole library (optional mode, phase 6).
- OAuth. Like obsidian-raindrop, a personal token avoids running any middleware.
- Full-text search of document bodies.

## 3. Prior art: obsidian-raindrop

We keep its user-facing design and replace its internals. This comparison rests on its README, `main.ts`, `manifest.json` and `package.json`; its `src` folder could not be fetched, so the Svelte components are inferred from imports.

| Aspect | obsidian-raindrop | This plugin |
| --- | --- | --- |
| Entry point | `registerMarkdownCodeBlockProcessor("raindrop", …)` | Same, with `reader` |
| Block syntax | `key: value` lines | Same style, parsed line by line |
| Parsing | One regex per key (`key:(.*)`) run over the whole source | A line parser that splits on the first `:`, so a value containing `sort:` cannot be read as a key |
| Auth | Personal test token pasted into settings | Personal access token from readwise.io/access_token |
| Refresh | Interval setting, default 60 minutes | Same setting, plus a cache that shows stale data while refetching |
| UI | Svelte components with svelte-query | Plain TypeScript DOM code and a small cache; no framework |
| Build | esbuild 0.13, node-sass, Svelte 3 | Current esbuild and TypeScript; no Sass |
| Search | Raindrop search syntax sent to the API | Filter syntax implemented client-side |
| Licence | MIT | MIT; attribution kept if any code is copied |

## 4. Architecture and layout

```text
obsidian-readwise-reader/
  manifest.json  versions.json  version-bump.mjs  styles.css
  package.json  tsconfig.json  esbuild.config.mjs  eslint config
  src/
    main.ts              plugin class: settings, processor, commands
    settings.ts          settings model and tab
    block/params.ts      codeblock source -> typed params
    api/http.ts          requestUrl wrapper, auth, error types
    api/reader.ts        list documents, list tags
    api/types.ts         response types
    cache/cache.ts       in-memory + persisted cache, in-flight sharing
    cache/limiter.ts     per-endpoint rate limiter
    filter/tokenize.ts   filter string -> tokens
    filter/parse.ts      tokens -> AST
    filter/fields.ts     field table: accessors, types, operators
    filter/dates.ts      absolute and relative date parsing
    filter/evaluate.ts   AST -> predicate
    filter/pushdown.ts   AST -> API query parameters
    render/view.ts       block lifecycle (MarkdownRenderChild)
    render/list.ts       list format
    render/table.ts      table format
  tests/                 Vitest, fixtures taken from the API examples
```

Request path for one block:

1. Obsidian calls the processor with the block source.
2. `params.ts` parses it into typed parameters; errors render inline.
3. `parse.ts` builds the filter AST and `pushdown.ts` extracts API parameters.
4. The cache returns fresh data, or stale data now plus a background refetch; identical in-flight requests share one fetch.
5. `evaluate.ts` filters the documents, then the block sorts and truncates them.
6. The renderer draws the list or table and schedules the next refresh.

## 5. Shared internal modules

Only the HTTP client and the view touch Obsidian.

| Module | Responsibility | Design notes |
| --- | --- | --- |
| `api/http.ts` | Authenticated requests to readwise.io | Uses Obsidian's `requestUrl` (no CORS problem, works on mobile). Header `Authorization: Token …`. Throws typed errors: auth (401/403), rate limited (429 with `Retry-After`), server, network. The fetcher is injected so tests need no Obsidian. |
| `cache/limiter.ts` | Keep each endpoint under its limit | Token bucket per endpoint group: Reader list 20/min, save and update 50/min, everything else conservative. Callers queue instead of failing. A 429 pauses the bucket for `Retry-After`. |
| `cache/cache.ts` | Avoid repeat calls | Key is the normalised request. Entries carry `fetchedAt`: fresh inside the refresh interval, stale after. Stale entries render at once while a refetch runs. Identical in-flight requests share one promise. Persisted in the plugin's data so a restart does not refetch. |
| `settings.ts` | Token, interval, caps, defaults | `loadData` and `saveData`; numbers are validated instead of storing `NaN`. |
| `block/params.ts` | Block source to typed parameters | Splits each line on the first `:`. Unknown keys produce a visible warning, not silence. |
| `render/view.ts` | Block lifecycle | A `MarkdownRenderChild`, so timers and listeners go away when the block leaves the page. Refresh runs on `registerInterval`. |

## 6. Reader data layer

Version 1 fetches per query: the API-friendly parts of the filter narrow the request, and the rest is applied locally. The list endpoint (`GET /api/v3/list/`) returns at most 100 documents a page with a `nextPageCursor`, and allows 20 requests a minute.

**Fetch strategy**

1. Push down what the API understands: `location`, `category`, up to five `tag` parameters, and `updatedAfter`.
2. Page with `pageCursor` until the cursor is empty or the page cap is reached (default 10 pages, 1,000 documents).
3. Drop highlight and note documents (those with `parent_id` set) unless the filter asks for `category:highlight` or `category:note`.
4. Run the full filter over what came back, then sort and truncate.
5. If the cap stopped the fetch early, show a visible notice such as "showing the first 1,000 documents".

**Pushdown rules** (conservative, so a pushed term can never drop a correct result)

- Only positive terms in the top-level AND chain are pushed. `in__not:archive` and anything under `NOT` stays local.
- A top-level OR is split into one fetch per branch when every branch pushes something (at most three), then merged by document id. Otherwise the plugin makes one broad fetch.
- Tags are matched by tag key, so the first use loads the tag list (`GET /api/v3/tags/`) and caches the name-to-key map.
- `saved__after:X` can become `updatedAfter=X` if `updated_at` is never earlier than `saved_at`. Check this against live data before it ships.

**Cost against the 20-requests-a-minute budget** (shared by every block in the vault)

| Slice fetched | Requests | Share of one minute's budget |
| --- | --- | --- |
| 100 documents | 1 | 5% |
| 1,000 documents (the default cap) | 10 | 50% |
| 2,000 documents | 20 | 100% |
| 5,000 documents | 50 | 250%, so the limiter queues the rest |

Unfiltered blocks over big libraries should be rare. The truncation notice tells people to narrow the filter or raise the cap, and phase 6 adds a local snapshot mode for them.

## 7. Reader filter language

The plugin implements Reader's filter syntax itself, following the [official syntax guide](https://docs.readwise.io/reader/guides/filtering/syntax-guide), which is marked work in progress. Edge cases are listed in section 13. The parser and evaluator are pure TypeScript with no Obsidian dependency, so they are fully unit-testable.

**Grammar** (our reading of the guide and published examples)

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

Two details come from published examples rather than the guide. Values can contain spaces without quotes (`author:Paul Graham AND …`), so a value ends only at `AND`, `OR`, a closing parenthesis, or a token shaped like `field:`. And `has:` takes a field name as its value (`has:highlights`). Adjacent terms with no keyword are treated as AND; that is our extension and needs checking against Reader.

**Operators**

| Operator | Applies to | Meaning |
| --- | --- | --- |
| none (`:`) | strings | Case-insensitive fuzzy match; ours is token and substring based |
| `__exact` | strings | Whole value equals, case-insensitive |
| `__contains` | strings | Substring |
| `__gt` `__gte` `__lt` `__lte` | numbers | Comparison |
| `__before` `__after` | dates | Earlier or later than the date |
| `__not` | any | Negates the term |

**Fields and where each value comes from**

| Filter field | Document field | Notes |
| --- | --- | --- |
| `in`, `location` | `location` | `inbox` is assumed to mean `new`; `shortlist` is a valid API location. Pushed down. |
| `category`, `type` | `category` | Pushed down. Value list to confirm (a third-party example uses `type:news`). |
| `tag` | `tags` | Shape of the tags value to confirm from a live response. Pushed down by tag key. |
| `title`, `author` | `title`, `author` | Local. |
| `url`, `domain` | `source_url`, `site_name` | `domain` matches the hostname of `source_url` or `site_name`. |
| `saved`, `published` | `saved_at`, `published_date` | Dates. |
| `last_opened`, `last_status` | `last_opened_at`, `last_moved_at` | The `last_status` mapping is an assumption. |
| `seen`, `unseen`, `feed` | `first_opened_at`, `location` | Binary; `feed` means `location` is `feed`. |
| `words`, `minutes` | `word_count`, `reading_time` | `reading_time` is a string such as "4 mins"; parse it, falling back to words ÷ 238 (an assumed reading speed). |
| `progress` | `reading_progress` | The API gives 0–1; the filter uses percent (`progress__gt:5`). |
| `has:notes`, `has:tags` | `notes`, `tags` | Non-empty. |
| `has:highlights`, `highlights` | highlight documents | Needs a second fetch of highlight documents matched by `parent_id`; done lazily, only when the query uses it. |
| `saved_using` | `source` | Partial: the API gives a free-text source string. |
| `shared`, `saved_count`, `rss_source` | not returned by the list endpoint | Parsed, then reported as unsupported in the block; never silently ignored. |

**Dates.** Absolute (`2026-03-20`) and relative (`"1 week ago"`, `"8 days"`). Relative dates accept at least days, weeks, months and years, with or without `ago`, and use the clock at evaluation time. Absolute dates mean local midnight. Both are checked against Reader.

**Errors.** A syntax error renders inline with its position and the expected token. An unknown field is named, with the nearest known field suggested. A block never falls back to an unfiltered list on error.

**Evaluation.** The AST compiles once to a predicate closure, so filtering 5,000 documents is a single pass.

## 8. Reader block specification

A block is `key: value` lines, and only `search` is commonly needed. Keys follow obsidian-raindrop's naming wherever the meaning is the same.

| Key | Default | Values | Effect |
| --- | --- | --- | --- |
| `search` | none (all non-highlight documents) | Reader filter string | Filter, see section 7 |
| `sort` | `-saved_at` | `saved_at`, `updated_at`, `published_date`, `title`, `author`, `word_count`, `reading_progress`; a `-` prefix means descending | Sort order, applied locally |
| `format` | `list` | `list`, `table` | Display format |
| `columns` | `title, author, site, saved` | Table only: `title`, `author`, `site`, `category`, `location`, `words`, `time`, `progress`, `saved`, `published`, `tags` | Table columns, in order |
| `limit` | `50` | 1–500 | Maximum rows displayed |
| `showTags` | `true` | `true`, `false` | Tag chips under each item |
| `showSummary` | `false` | `true`, `false` | Reader's summary text |
| `group` | none | `location`, `category`, `site` | Group headings |

Example (the lines inside a `reader` fence):

```text
search: in:later tag:css AND saved__after:"2 weeks ago"
sort: -saved_at
format: table
columns: title, author, site, words, saved
limit: 25
```

**Rendering.** List items show the title linked to the Reader URL, a smaller link to the original page, a meta line (author · site · reading time · saved date), tag chips and a progress bar. Tables use Obsidian's own table styling. All classes are prefixed `rwr-` and use theme CSS variables, so light, dark and community themes work.

**States.** Loading shows a skeleton. Empty shows "No documents match" with the parsed filter. A rejected token links to settings. Rate limiting shows a countdown and keeps stale results visible. A fetch stopped by the page cap shows a truncation notice. Filter errors render inline.

**Controls.** Each block gets a small refresh button, and a command refreshes every block in the active note. Blocks refresh in the background on the interval, only while their note is open.

**Later.** A `highlights: true` key that lists each document's highlights, as obsidian-raindrop does. It costs an extra fetch, so it waits for phase 6.

## 9. Settings and security

| Setting | Default | Notes |
| --- | --- | --- |
| Access token | empty | Masked input. A "Test connection" button calls `GET /api/v2/auth/` and reports success or the error. |
| Refresh interval (minutes) | 60 | Same as obsidian-raindrop. Minimum 5, so a typo cannot exhaust the rate limit. |
| Maximum pages per query | 10 | Caps one query at 1,000 documents. |
| Default format and limit | `list`, 50 | Used when a block leaves them out. |
| Persist cache between sessions | on | Turn off to keep documents out of the plugin's data file. |
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

The filter engine is the riskiest code and the most testable, so it gets the most tests.

**Automated (Vitest, run in CI)**

- Tokenizer and parser: table-driven cases that include every example filter published in Reader's guides, such as `tag:shortlist AND (in:inbox OR in:later)`, `progress__gt:5 AND last_opened__after:"1 week ago" AND in__not:archive`, `domain:substack AND published__after:"35 days ago" AND title__contains:AI` and `author:Paul Graham AND published__after:"4 months ago"`. Also malformed input: unbalanced parentheses, unknown fields, empty values.
- Evaluator: fixture documents built from the example responses in the API docs, with a fixed clock for relative dates.
- Pushdown: AST in, API parameters out, including OR splitting and the cases that must not push.
- Cache and limiter: fake timers; checks for stale-while-revalidate, in-flight sharing, the 429 pause and `Retry-After`.
- API client: a mocked fetcher returning fixtures, including 401, 429 and paging.
- Params parser: keys, defaults, unknown-key warnings.

**Contract check (manual, not in CI).** An `npm run contract` script calls the real API with a token from the environment and compares response shapes with the types. It settles the open items about tags, `reading_time` and locations.

**Parity check.** For about 15 filters, run each in Reader's own filter view and in a block, then compare counts and the first ten results. Record every difference in the repo; each is either fixed or listed as a known divergence in the README.

**Manual checklist in a test vault**

- Bad token, no token, offline, empty result, and a forced 429.
- Ten blocks in one note make one request per distinct query.
- A large library: a broad query hits the page cap and shows the notice.
- Light and dark themes, plus one community theme.
- Live Preview and Reading mode; switching notes leaves no timers behind.
- iOS and Android: layout, link opening and refresh.

## 12. Milestones

Sizes are relative (S, M, L), not calendar estimates.

| Phase | Deliverable | Done when | Size |
| --- | --- | --- | --- |
| 0. Spikes and scaffold | Repo from template; a live-API check of tags, `reading_time`, locations and `saved_at` against `updated_at`; a secret-storage check | Plugin loads in a test vault; findings are written into section 13 | S |
| 1. Foundation | `http.ts`, limiter, cache, settings with connection test, params parser, a `reader` block with pushed-down keys only, list rendering | A block listing Later documents works and survives a 429 | M |
| 2. Filter engine | Tokenizer, parser, evaluator, dates, pushdown, inline error rendering | Every published Reader example parses and evaluates; unit tests pass | L |
| 3. Polish | Table format, sort, group, columns, states, refresh controls, styles, README | The parity check passes or its divergences are documented | M |
| 4. Hardening and beta | Mobile testing, large-library tests, accessibility pass, release workflow, BRAT beta | The beta installs from GitHub and runs on desktop and mobile | M |
| 5. Later options | Local snapshot mode, `highlights: true`, save-to-Reader command, create-note command, community submission | Chosen after beta feedback | L |

Phase 2 is the long pole because the filter grammar is only partly documented; the phase 0 findings may change its size.

## 13. Risks and open questions

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Reader's syntax guide is marked work in progress | Filters behave differently from Reader | Parity check, documented divergences, and a data-driven field table so fixes are small |
| 20 requests a minute on the list endpoint | Slow or failing blocks on big libraries | Pushdown, page cap, shared cache, in-flight sharing, limiter queue, visible notices |
| Token stored in plain text | Leak if the vault is synced or published | README warning; secret storage if the Obsidian API offers it |
| Broad queries over large libraries | Long waits, memory use | Page cap, row limit, truncation notice; snapshot mode later |
| Rendering many rows on mobile | Sluggish notes | Default limit 50, maximum 500 |
| Overlap with the official Readwise plugin | Confusion about purpose | The README states the difference: live query blocks, nothing synced into the vault |
| API changes | Breakage | Typed responses, the contract script, tolerant parsing of unknown fields |

**Verify against live data or current docs before relying on them**

1. Implicit AND between terms, the meaning of `in:inbox`, valid `type` values and Reader's fuzzy matching.
2. The shape of `tags` in list responses.
3. Whether `reading_time` is always a string, and Reader's reading speed.
4. That `saved_at` is never later than `updated_at` (needed for the `saved__after` pushdown).
5. How deletions appear in the list endpoint. Without a signal, cached results can show removed documents until the next full fetch.
6. Current rate limits.
7. Obsidian's secret-storage API and the minimum app version for the APIs used.
8. The community directory's naming rules for plugin ids and names.

**Assumptions to confirm:** a separate repo for this plugin, and read-only blocks for v1.

## 14. Release and distribution

Beta through BRAT from GitHub releases first, then a submission to the community plugin directory once the parity check is clean.

1. **Manifest.** `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `authorUrl`, `isDesktopOnly: false`. Set `minAppVersion` to the lowest version that has every API used. The working name is `obsidian-readwise-reader`; the final id follows the directory's naming rules.
2. **Versioning.** Semantic versions. `npm version` runs `version-bump.mjs`, which updates `manifest.json` and `versions.json` (the map from plugin version to minimum Obsidian version).
3. **GitHub release.** Each tag attaches `main.js`, `manifest.json` and `styles.css`, built by the release workflow.
4. **README.** Install steps, where to get the token, the block reference with examples, the filter field table with supported and unsupported fields, rate-limit behaviour, the network and token disclosures, and how it differs from the official Readwise plugin.
5. **Beta.** Install through BRAT, then collect parity differences and mobile issues.
6. **Submission.** A pull request to the Obsidian releases repository adds the plugin to the community list; address the review findings.
7. **Licence and credit.** MIT. The README credits obsidian-raindrop as the design reference, and any copied code keeps its copyright notice.

## Sources

- [mtopping/obsidian-raindrop](https://github.com/mtopping/obsidian-raindrop)
- [Reader API](https://readwise.io/reader_api)
- [Readwise API](https://readwise.io/api_deets)
- [Reader filtering syntax guide](https://docs.readwise.io/reader/guides/filtering/syntax-guide)
