'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const R = require('../research.js')
for (const f of ['index.js', 'research.js']) new vm.Script(fs.readFileSync(require('node:path').join(__dirname, '..', f), 'utf8'))
const snapshot = { nodes: [
  { id: 's', title: 'Seed', seed: true, doi: 'https://doi.org/10.1234/SEED', authors: ['Author'], year: 2020 },
  { id: 'r', title: 'Reference', authors: [], year: 2010 },
  { id: 'c', title: '<img src=x onerror=alert(1)>', authors: [], year: 2024 }
], edges: [{ source: 's', target: 'r', evidence: [{ provider: 'A' }] }, { source: 'c', target: 's', evidence: [{ provider: 'B' }] }] }
const g = R.fromSnapshot(snapshot, 1.32, 'Fixture')
assert.deepEqual(g.seedArticles[0].references, ['r'])
assert.deepEqual(g.citingArticles[0].references, ['s'])
assert.equal(R.articles(g).length, 3)
g.research = R.edit(g, g.seedArticles[0], 'Gram, Control, Gram', 'read', '#0072b2', 'box')
const saved = JSON.parse(JSON.stringify(g))
assert.deepEqual(R.annotation(saved, { doi: 'DOI:10.1234/seed' }).tags, ['Gram', 'Control'])
assert.equal(R.style(saved, saved.seedArticles[0], 'tags').shape, 'box')
assert.equal(R.style(saved, saved.seedArticles[0], 'year').shape, undefined)
assert.equal(R.style(saved, saved.seedArticles[0], 'year').borderWidth, 4)
const promoted = R.promote(saved, 'r')
assert.equal(promoted.seedArticles.length, 2)
assert.equal(saved.seedArticles.length, 1)
assert.deepEqual(promoted.research.edges, saved.research.edges)
assert.equal(R.annotation(promoted, promoted.seedArticles[0]).status, 'read')
assert.throws(() => R.fromSnapshot({ ...snapshot, nodes: [...snapshot.nodes, snapshot.nodes[0]] }, 1, 'bad'), /duplicate/)
assert.throws(() => R.fromSnapshot({ ...snapshot, edges: [{ source: 's', target: 'missing' }] }, 1, 'bad'), /endpoints/)
assert.throws(() => R.edit(g, g.seedArticles[0], 'tag', 'bad', '#000000', ''), /status/)
assert.throws(() => R.edit(g, g.seedArticles[0], 'tag', 'read', 'url(x)', ''), /color/)
const scanned = R.scanFiles([{ name: 'a.bib', text: '@article{x, doi={10.1234/SEED}}' }, { name: 'b.bib', text: 'https://doi.org/10.1234/seed' }, { name: 'c.bib', text: '@book{x,title={No DOI}}' }])
assert.deepEqual(scanned.ids, ['10.1234/seed'])
assert.deepEqual(scanned.origins['doi:10.1234/seed'], ['a.bib', 'b.bib'])
assert.deepEqual(scanned.empty, ['c.bib'])
const native = { seedArticles: [{ id: 'a', references: ['b', 'b'], doi: '10.1234/a' }], citedArticles: [{ id: 'b', references: [] }], API: 'OpenAlex', timestamp: 1 }
assert.equal(R.links(native).length, 1)
assert.equal(R.links(native)[0].evidence[0].provider, 'OpenAlex')
assert.equal(R.links(native)[0].source, 'a')
assert.equal(R.links(native)[0].target, 'b')
const second = JSON.parse(JSON.stringify(g))
second.API = 'Other provider'
second.research.edges[0].evidence = [{ provider: 'Other' }]
second.research.annotations['doi:10.1234/seed'].status = 'unread'
const merged = R.merge(g, second, 1.32)
assert.equal(merged.seedArticles.length, 1)
assert.equal(R.annotation(merged, merged.seedArticles[0]).status, 'read')
assert.equal(R.articles(merged).length, 5) // No DOI: different providers stay distinct.
assert.equal(R.links(merged).length, 4)
const same = R.merge(g, JSON.parse(JSON.stringify(g)), 1.32)
assert.equal(R.articles(same).length, 3)
assert.equal(R.links(same).length, 2)
const mergedAgain = R.merge(merged, second, 1.32)
assert.equal(R.articles(mergedAgain).length, R.articles(merged).length)
assert.equal(R.links(mergedAgain).length, R.links(merged).length)
console.log('Research unit tests passed: import, directions, annotations, persistence, promotion, malformed input, multi-file DOI scan.')
