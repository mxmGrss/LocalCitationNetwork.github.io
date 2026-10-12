/* Research extensions for Local Citation Network — GPL-3.0 */
'use strict'
const Research = (() => {
  const palette = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9']
  const copy = x => JSON.parse(JSON.stringify(x))
  const doi = x => String(x || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase()
  const key = article => article.doi ? 'doi:' + doi(article.doi) : 'id:' + article.id
  const annotation = (graph, article) => graph.research?.annotations?.[key(article)] || { tags: [], status: 'unread' }
  function tags (text) { return [...new Set(String(text).split(',').map(x => x.trim()).filter(Boolean))].slice(0, 30) }
  function color (tag) { let n = 0; for (const c of tag) n = (n * 31 + c.charCodeAt(0)) >>> 0; return palette[n % palette.length] }
  function state (graph) {
    return Object.assign({ version: 1, annotations: {}, tagStyles: {}, edges: [], origins: {} }, copy(graph.research || {}))
  }
  function edit (graph, article, text, status, tagColor, tagShape) {
    if (!['unread', 'to-read', 'read'].includes(status)) throw new Error('Invalid reading status')
    const next = state(graph)
    const list = tags(text)
    next.annotations[key(article)] = { tags: list, status }
    if (list.length) {
      if (!/^#[0-9a-f]{6}$/i.test(tagColor)) throw new Error('Invalid tag color')
      if (!['', 'dot', 'box', 'diamond', 'triangle', 'star', 'hexagon'].includes(tagShape)) throw new Error('Invalid tag shape')
      next.tagStyles['tag:' + list[0]] = { color: tagColor, shape: tagShape }
    }
    return next
  }
  function style (graph, article, mode) {
    const a = annotation(graph, article)
    const tag = a.tags?.[0] || ''
    const cfg = graph.research?.tagStyles?.['tag:' + tag] || {}
    const result = { borderWidth: a.status === 'read' ? 4 : 1, shapeProperties: { borderDashes: a.status === 'to-read' } }
    if (mode === 'tags') {
      result.color = { background: /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : (tag ? color(tag) : '#bbbbbb'), border: '#222222' }
      if (['dot', 'box', 'diamond', 'triangle', 'star', 'hexagon'].includes(cfg.shape)) result.shape = cfg.shape
    }
    return result
  }
  function articles (graph) {
    return [...new Map(['seedArticles', 'citedArticles', 'citingArticles', 'coCitedArticles', 'coCitingArticles'].flatMap(k => graph[k] || []).map(a => [a.id, a])).values()]
  }
  function links (graph) {
    if (graph.research?.edges?.length) return graph.research.edges
    const all = articles(graph)
    const ids = new Set(all.map(a => a.id))
    const edges = new Map()
    for (const a of all) for (const id of a.references || []) {
      if (!ids.has(id) || id === a.id) continue
      const url = a.doi ? 'https://doi.org/' + doi(a.doi) : (graph.API === 'OpenAlex' ? 'https://openalex.org/' + a.id : '')
      edges.set(JSON.stringify([a.id, id]), { source: a.id, target: id, evidence: [{ provider: graph.API, date: new Date(graph.timestamp || 0).toISOString(), url }] })
    }
    return [...edges.values()]
  }
  function promote (graph, id) {
    const next = copy(graph)
    const all = articles(next)
    const article = all.find(a => a.id === id)
    if (!article) throw new Error('Article not found')
    if (next.seedArticles.some(a => a.id === id)) return next
    next.seedArticles.push(article)
    const seeds = new Set(next.seedArticles.map(a => a.id))
    const refs = new Set(next.seedArticles.flatMap(a => a.references || []))
    next.citedArticles = all.filter(a => !seeds.has(a.id) && (refs.has(a.id) || !a.references?.some(x => seeds.has(x))))
    next.citingArticles = all.filter(a => !seeds.has(a.id) && a.references?.some(x => seeds.has(x)))
    next.source = { references: [...seeds], customListOfReferences: [...seeds] }
    next.research = state(next)
    next.research.coverageNote = 'Rankings recomputed from collected links only. Promotion does not fetch new references or citers.'
    next.tabLabel = graph.tabLabel
    return next
  }
  function fromSnapshot (data, version, name) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Expected nodes and edges arrays')
    const map = new Map()
    const annotations = {}
    const tagStyles = {}
    for (const n of data.nodes) {
      if (!n || typeof n.id !== 'string' || !n.id || map.has(n.id) || typeof n.title !== 'string') throw new Error('Invalid or duplicate node')
      if (n.authors !== undefined && !Array.isArray(n.authors)) throw new Error('Invalid authors')
      const article = { id: n.id, doi: doi(n.doi), title: n.title, year: Number(n.year) || undefined, authors: (n.authors || []).map(a => ({ LN: String(typeof a === 'string' ? a : a.name || ''), FN: '' })), journal: n.journal || '', abstract: n.abstract || '', type: n.type, date: n.date, volume: n.volume, issue: n.issue, firstPage: n.firstPage, lastPage: n.lastPage, references: [], citationsCount: n.cited_by_count || n.citationsCount || 0 }
      map.set(n.id, article)
      const list = Array.isArray(n.tags) ? tags(n.tags.join(',')) : tags(n.group || '')
      annotations[key(article)] = { tags: list, status: n.read === true ? 'read' : 'unread' }
      if (list.length && /^#[0-9a-f]{6}$/i.test(n.color)) tagStyles['tag:' + list[0]] = { color: n.color, shape: '' }
    }
    const links = new Map()
    for (const e of data.edges) {
      if (!e || !map.has(e.source) || !map.has(e.target) || e.source === e.target || (e.kind && e.kind !== 'citation')) throw new Error('Invalid citation endpoints or kind')
      if (e.evidence !== undefined && !Array.isArray(e.evidence)) throw new Error('Invalid evidence')
      const k = JSON.stringify([e.source, e.target])
      if (!links.has(k)) links.set(k, { source: e.source, target: e.target, evidence: [] })
      links.get(k).evidence.push(...copy(e.evidence || []))
    }
    for (const e of links.values()) map.get(e.source).references.push(e.target)
    const seedIds = new Set(data.nodes.filter(n => n.seed).map(n => n.id))
    if (!seedIds.size) throw new Error('Snapshot has no seeds')
    const all = [...map.values()]
    const refs = new Set(all.filter(a => seedIds.has(a.id)).flatMap(a => a.references))
    return { source: { references: [...seedIds] }, seedArticles: all.filter(a => seedIds.has(a.id)), citedArticles: all.filter(a => !seedIds.has(a.id) && (refs.has(a.id) || !a.references.some(id => seedIds.has(id)))), citingArticles: all.filter(a => !seedIds.has(a.id) && a.references.some(id => seedIds.has(id))), API: 'Imported snapshot', tabLabel: name, tabTitle: name, timestamp: Date.parse(data.date) || Date.now(), localCitationNetworkVersion: version, allCited: false, allCiting: false, research: { version: 1, annotations, tagStyles, edges: [...links.values()], origins: {}, coverage: copy(data.coverage || {}), coverageNote: 'Imported snapshot: collected citations only; no claim of database completeness. Articles without a year remain in tables.' } }
  }
  function merge (primary, secondary, version) {
    if (primary === secondary) throw new Error('Choose a different network')
    const graphs = [primary, secondary]
    const aliases = new Map()
    for (const g of graphs) for (const a of articles(g)) {
      const alias = String(g.API) + ':' + a.id
      if (a.doi) aliases.set(alias, 'doi:' + doi(a.doi))
      else if (!aliases.has(alias)) aliases.set(alias, 'provider:' + alias)
    }
    const idFor = (g, a) => a.doi ? 'doi:' + doi(a.doi) : (a.id.startsWith('provider:') ? a.id : aliases.get(String(g.API) + ':' + a.id))
    const nodes = new Map()
    const combined = new Map()
    const annotations = {}
    const origins = {}
    for (const g of graphs) {
      const all = articles(g)
      const index = new Map(all.map(a => [a.id, a]))
      const seeds = new Set(g.seedArticles.map(a => a.id))
      for (const a of all) {
        if (!a.id) throw new Error('Resolve or remove missing articles before merging')
        const id = idFor(g, a)
        if (!nodes.has(id)) nodes.set(id, { ...copy(a), id, doi: a.doi, title: a.title || id, authors: (a.authors || []).map(n => [n.FN, n.LN].filter(Boolean).join(' ')), year: a.year, seed: seeds.has(a.id) })
        else if (seeds.has(a.id)) nodes.get(id).seed = true
        const targetKey = key({ id, doi: a.doi })
        const original = g.research?.annotations?.[key(a)]
        if (original && !annotations[targetKey]) annotations[targetKey] = copy(original)
        origins[targetKey] = [...new Set([...(origins[targetKey] || []), ...(g.research?.origins?.[key(a)] || [])])]
      }
      for (const edge of links(g)) {
        const a = index.get(edge.source); const b = index.get(edge.target)
        if (!a || !b) continue
        const source = idFor(g, a); const target = idFor(g, b)
        if (source === target) continue
        const k = JSON.stringify([source, target])
        if (!combined.has(k)) combined.set(k, { source, target, evidence: [] })
        const list = combined.get(k).evidence
        for (const proof of edge.evidence || []) if (!list.some(p => JSON.stringify(p) === JSON.stringify(proof))) list.push(copy(proof))
      }
    }
    const merged = fromSnapshot({ nodes: [...nodes.values()], edges: [...combined.values()] }, version, primary.tabLabel + ' + ' + secondary.tabLabel)
    merged.research.annotations = { ...merged.research.annotations, ...annotations }
    merged.research.tagStyles = { ...(secondary.research?.tagStyles || {}), ...(primary.research?.tagStyles || {}) }
    merged.research.origins = origins
    merged.research.coverageNote = 'Union of saved networks, matched by DOI or same-provider ID. Current network wins annotation conflicts. Collected links only; no new requests.'
    return merged
  }
  function scanFiles (files) {
    const origins = {}
    const empty = []
    for (const file of files) {
      const found = [...new Set((file.text.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+[-_()/:A-Z0-9]+/gi) || []).map(doi))]
      if (!found.length) empty.push(file.name)
      for (const id of found) { const k = 'doi:' + id; origins[k] ||= []; if (!origins[k].includes(file.name)) origins[k].push(file.name) }
    }
    return { ids: Object.keys(origins).map(k => k.slice(4)), origins, empty }
  }
  return { doi, key, annotation, tags, color, state, edit, style, articles, links, promote, fromSnapshot, merge, scanFiles }
})()
if (typeof module !== 'undefined') module.exports = Research
