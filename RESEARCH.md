# Research workspace fork

This GPL-3.0 fork extends [Local Citation Network](https://github.com/LocalCitationNetwork/LocalCitationNetwork.github.io). Upstream authorship and license are retained. Initial upstream revision: 6a21efc4b946b3ec098bb29e7d039731848e93a6.

## Run

Serve this directory with any static HTTP server, for example:

~~~sh
python -m http.server 8000 --bind 127.0.0.1
~~~

Open http://127.0.0.1:8000. No backend or build step is required. Online acquisition uses the original LCN providers. Reading a saved graph requires no provider request.

## Added workflow

- Select several .bib/.ris/.txt files in the bibliography picker. The DOI scan deduplicates identifiers and retains originating filenames. It does not parse complete BibTeX entries, resolve missing DOIs, or decide which references the manuscript actually cites. Review the DOI list before collecting.
- Select an article and open **Research workspace**. Add comma-separated tags; the first tag is primary. Choose unread / to read / read.
- In network settings, choose **Primary tag** as node color. Each primary tag can have a color and an optional shape. Without shape override, LCN's citation-role shapes remain. Thick border means read; dashed border means to read. The tag filter applies to tables and citation graph; other LCN display limits still apply.
- **Add to seed corpus** recalculates rankings from links already collected. It does not silently start an expensive new acquisition. Use the existing LCN source/list workflow to collect a new neighborhood.
- **Load** accepts both existing LCN JSON and an enriched snapshot with nodes/edges/seed flags. Each edge's evidence is retained and displayed as text, without executing metadata markup.
- **Merge into new tab** unions seeds and collected links. Across providers, only equal normalized DOIs are merged. Without DOI, only identical IDs within the same provider are merged. Titles are never treated as identity. The current tab wins metadata/annotation conflicts; provenance and bibliography origins are combined. Unresolved placeholder articles must be resolved before merging. With five tabs already open, upstream's tab limit evicts the oldest tab: export first.

## Persistence and provenance

Use **download full network as JSON** and reload through **Load**. Research annotations, tag styles, origins and evidence live in the graph's research field, independently of article metadata. Browser caching is optional and size-limited. Nothing is auto-uploaded; provider requests contain selected identifiers as in upstream LCN. A new acquisition creates a new tab: merge it into your annotated tab (current tab wins) to preserve editorial choices.

For imported snapshots, evidence is kept verbatim. For native LCN graphs, provenance records provider, graph timestamp and source article link; it is not a raw API-response archive. Merging covers the saved articles and known links, not all literature. Resolved seeds remain visible even without collected links; undated seeds occupy an unknown-year level. Non-seed papers without a year remain in tables. Counts and rankings are local, not measures of scientific quality.

## Tests

~~~sh
node tests/research.test.cjs
node tests/browser.test.cjs
~~~

The browser test requires Playwright and an installed Chromium browser. Set BROWSER_CHANNEL=msedge or chrome to use an installed browser. PLAYWRIGHT_MODULE can point to an existing node_modules directory; no production dependency is added. Default browser tests block external requests. They exercise UI edits, graph styling, file export/reload, promotion, merge and metadata escaping.

An optional manifest path enables local project regressions: projects entries have name, bibs (paths), and snapshot (enriched snapshot or saved LCN graph). A live:true entry runs the existing OpenAlex acquisition with Top 10 Cited / Top 10 Citing; output stores its network locally. Never commit private project fixtures. The local evaluation used two manuscript bibliographies and a 2,748-node / 3,944-edge snapshot; these are not included in this repository.

## Deliberately not added

No server, PDF ingestion, LLM tagging, automatic title matching, arbitrary provider plugin framework, or replacement of LCN's graph/ranking engine. Semantic Scholar Recommendations is distinct from citation-based Top Cited/Top Citing and has not been added. Existing upstream API quotas/retry behavior still applies.
