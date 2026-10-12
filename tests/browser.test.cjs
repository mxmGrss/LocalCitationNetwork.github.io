'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium } = (process.env.PLAYWRIGHT_MODULE ? createRequire(path.join(process.env.PLAYWRIGHT_MODULE, '_test.cjs')) : require)('playwright')
const R = require('../research.js')
const root = path.resolve(__dirname, '..')
async function main () {
  const server = http.createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
      if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return }
      const target = file === root ? path.join(root, 'index.html') : file
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(target)] || 'application/octet-stream')
      res.end(await fs.readFile(target))
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
    await page.goto('http://127.0.0.1:' + server.address().port)
    await page.waitForFunction(() => typeof vm !== 'undefined')
    await page.evaluate(() => { window.researchTestErrors = []; const original = vm.errorMessage; vm.errorMessage = function (m) { window.researchTestErrors.push(String(m)); original.call(this, m) } })
    const fixture = { nodes: [{ id: 'seed', seed: true, title: 'Seed', authors: ['Test'], year: 2020 }, { id: 'ref', title: '<img src=x onerror="window.injected=true">', authors: ['Other'], year: 2010 }, { id: 'citer', title: 'Citer', authors: ['New'], year: 2025 }], edges: [{ source: 'seed', target: 'ref', evidence: [{ provider: 'Fixture', date: '2026-10-12' }] }, { source: 'citer', target: 'seed', evidence: [{ provider: 'Fixture' }] }] }
    await page.evaluate(data => { vm.file = new File([JSON.stringify(data)], 'fixture.json', { type: 'application/json' }) }, fixture)
    await page.waitForFunction(() => vm.seedArticles.length === 1 && vm.citedArticles.length === 1 && vm.citingArticles.length === 1)
    await page.locator('summary').filter({ hasText: 'Research workspace' }).click()
    await page.evaluate(() => { vm.selectedArticle = vm.seedArticles[0] })
    await page.getByTestId('research-tags').fill('Gram, Control')
    await page.getByTestId('research-status').selectOption('read')
    await page.getByTestId('research-save').click()
    await page.waitForFunction(() => vm.currentGraph.research.annotations['id:seed']?.status === 'read')
    await page.evaluate(() => { vm.citationNetworkNodeColor = 'tags'; vm.changeCurrentNetworkSettings() })
    await page.waitForFunction(() => citationNetwork && citationNetwork.body.data.nodes.get('seed')?.borderWidth === 4)
    assert.equal(await page.evaluate(() => window.injected), undefined)
    const downloaded = page.waitForEvent('download')
    await page.getByText('download full network as JSON', { exact: true }).first().click()
    const download = await downloaded
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'))
    assert.equal(exported[0].research.annotations['id:seed'].status, 'read')
    await page.evaluate(data => { vm.graphs = []; vm.file = new File([JSON.stringify(data)], 'saved.json', { type: 'application/json' }) }, exported)
    await page.waitForFunction(() => vm.currentGraph.research?.annotations['id:seed']?.tags[0] === 'Gram')
    await page.evaluate(() => { vm.selectedArticle = vm.citedArticles[0]; vm.promoteResearchArticle() })
    await page.waitForFunction(() => vm.seedArticles.length === 2)
    assert.equal(await page.evaluate(() => vm.currentGraph.research.edges.length), 2)
    await page.evaluate(g => { g.tabLabel += ' secondary'; vm.addGraphs([g]) }, exported[0])
    await page.evaluate(() => { vm.researchMergeTarget = 0; vm.mergeResearchNetworks() })
    await page.waitForFunction(() => vm.currentGraph.tabLabel.includes(' + '))
    assert.equal(await page.evaluate(() => Research.links(vm.currentGraph).length), 2)
    await page.evaluate(() => vm.addGraphs([Research.fromSnapshot({ nodes: [
      { id: 'isolated', seed: true, title: 'Isolated seed', authors: ['Test'], year: 2020 },
      { id: 'undated', seed: true, title: 'Undated seed', authors: ['Test'] }
    ], edges: [] }, localCitationNetworkVersion, 'Isolated seeds')]))
    await page.waitForFunction(() => citationNetwork?.body.data.nodes.get('undated'))
    assert.equal(await page.evaluate(() => citationNetwork.body.data.nodes.length), 2)
    assert.equal(await page.evaluate(() => citationNetwork.body.data.edges.length), 0)
    const reports = []
    if (process.argv[2]) {
      const manifest = JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
      for (const project of manifest.projects) {
        await page.getByTestId('research-files').setInputFiles(project.bibs)
        await page.waitForFunction(() => vm.editListOfIds && vm.listOfIds?.length)
        const scanned = await page.evaluate(() => ({ count: vm.listOfIds.length, origins: vm.researchOrigins }))
        let data
        if (project.live) {
          await page.unroute('**/*')
          await page.route('**/*', route => ['127.0.0.1', 'api.openalex.org'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
          await page.evaluate(() => { vm.API = 'OpenAlex'; vm.retrieveCitedArticles = 10; vm.retrieveCitingArticles = 10; vm.importList() })
          await page.waitForFunction(() => !vm.isLoading && vm.currentGraph.API === 'OpenAlex' && Array.isArray(vm.currentGraph.citedArticles) && Array.isArray(vm.currentGraph.citingArticles), null, { timeout: 240000 })
          if (project.output) await fs.writeFile(project.output, JSON.stringify(await page.evaluate(() => vm.currentGraph), null, 2))
        } else {
        await page.evaluate(() => { vm.editListOfIds = false; vm.listOfIds = undefined; vm.researchOrigins = {} })
        data = JSON.parse(await fs.readFile(project.snapshot, 'utf8'))
        const expected = data.seedArticles ? data : R.fromSnapshot(data, 1.32, project.name)
        await page.evaluate(({ data, name, origins }) => { const g = data.seedArticles ? data : Research.fromSnapshot(data, localCitationNetworkVersion, name); g.research.origins = origins; vm.addGraphs([g]) }, { data, name: project.name, origins: scanned.origins })
        await page.waitForFunction(n => vm.seedArticles.length === n, expected.seedArticles.length)
        }
        await page.waitForFunction(() => citationNetwork && !vm.citationNetworkIsLoading, null, { timeout: 30000 })
        const measured = await page.evaluate(() => ({ nodes: Research.articles(vm.currentGraph).length, edges: Research.links(vm.currentGraph).length, resolvedSeeds: vm.seedArticles.filter(a => a.id).length, missingSeeds: vm.seedArticles.filter(a => !a.id).map(a => a.title), seeds: vm.seedArticles.length, drawnNodes: citationNetwork.body.data.nodes.length, drawnSeeds: vm.seedArticles.filter(a => citationNetwork.body.data.nodes.get(a.id)).length, topCited: [...vm.citedArticles].sort((a,b) => vm.citedCount(b.id)-vm.citedCount(a.id)).slice(0,5).map(a => ({title:a.title,count:vm.citedCount(a.id)})) }))
        assert.equal(measured.drawnSeeds, measured.resolvedSeeds)
        if (data) { assert.equal(measured.nodes, data.seedArticles ? R.articles(data).length : data.nodes.length); assert.equal(measured.edges, data.seedArticles ? R.links(data).length : data.edges.length) }
        else { assert.ok(measured.seeds > 0); assert.ok(measured.drawnNodes > 0) }
        await page.evaluate(() => { vm.selectedArticle = vm.seedArticles[0]; vm.researchTags = 'Regression'; vm.researchStatus = 'read'; vm.saveResearchAnnotation() })
        const saved = await page.evaluate(() => JSON.parse(JSON.stringify(vm.currentGraph)))
        await page.evaluate(g => { g.tabLabel += ' reloaded'; vm.addGraphs([g]) }, saved)
        assert.equal(await page.evaluate(() => Research.annotation(vm.currentGraph, vm.seedArticles[0]).status), 'read')
        reports.push({ name: project.name, scannedDOIs: scanned.count, ...measured, roundTrip: true })
      }
      if (manifest.output) await fs.writeFile(manifest.output, JSON.stringify({ reports, browserErrors: errors }, null, 2))
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.researchTestErrors), [])
    console.log(JSON.stringify({ status: 'passed', tests: ['snapshot import', 'UI annotation', 'tag styling', 'HTML escaping', 'download and reload', 'promotion'], projects: reports }, null, 2))
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
