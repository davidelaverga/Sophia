import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { CITED_PAGE } from '../../../fixtures/report-data.ts'
import { framed, inPage, keptInPage } from './in-page-links.ts'

const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

describe('a designed page’s own links, kept in the framed page', () => {
  it('names a link to the page’s own fragment as the frame’s own address; any other link is not one', () => {
    assert.equal(inPage('#source-1'), 'about:srcdoc#source-1')
    assert.equal(inPage(' \n#a\t'), 'about:srcdoc#a')
    assert.equal(inPage('#'), 'about:srcdoc#')
    for (const href of ['', 'other.html#a', 'https://example.test/#a', 'about:srcdoc#a', 'javascript:x', '&#35;a']) {
      assert.equal(inPage(href), null, href)
    }
  })

  it('changes only the href of a and area to a fragment, however it is written, and not one other byte', () => {
    const before = page(
      `<p class=x><a data-cite="s" href="#source-1">[1]</a> <A HREF='#b'>2</A> <a href=#c>3</a> <a id=d href = " #d ">4</a>` +
        `<map><area shape=rect href="#e"></map></p>`,
    )
    assert.equal(
      keptInPage(before),
      page(
        `<p class=x><a data-cite="s" href="about:srcdoc#source-1">[1]</a> <A HREF='about:srcdoc#b'>2</A> <a href=about:srcdoc#c>3</a> <a id=d href = "about:srcdoc#d">4</a>` +
          `<map><area shape=rect href="about:srcdoc#e"></map></p>`,
      ),
    )
  })

  it('leaves links elsewhere, other attributes and other elements’ href as they are', () => {
    const same = page(
      `<a href="other.html#a">1</a><a href="https://example.test/#a">2</a><a href>3</a>` +
        `<a data-href="#a" title="#a">4</a><link href="#a"><div href="#a"></div><a href="#x" href="#y">5</a>`,
    )
    assert.equal(
      keptInPage(same),
      same.replace('<a href="#x" href="#y">', '<a href="about:srcdoc#x" href="#y">'),
      'only the first href of an element counts',
    )
  })

  it('reads text, comments, declarations and raw text past, never as tags', () => {
    const same = page(
      `<p>Write href="#a" and &lt;a href="#b"&gt; as text.</p><!-- <a href="#c"> --><!DOCTYPE x>` +
        `<style>a[href="#d"]{color:red}</style><title><a href="#e"></title><textarea><a href="#f"></TEXTAREA>` +
        `<script type="text/plain"><a href="#g"></script>`,
    )
    assert.equal(keptInPage(same), same)
    // Past a raw-text element's end tag, links count again.
    assert.equal(keptInPage('<style>x</style ><a href="#h">'), '<style>x</style ><a href="about:srcdoc#h">')
  })

  it('changes the page Sophia published in its six markers’ links only', () => {
    assert.equal(createHash('sha256').update(CITED_PAGE.text, 'utf8').digest('hex'), CITED_PAGE.sha256)
    const kept = keptInPage(CITED_PAGE.text)
    assert.equal(kept, CITED_PAGE.text.replaceAll('href="#source-1"', 'href="about:srcdoc#source-1"'))
    assert.equal(kept.split('about:srcdoc#source-1').length, 7)
  })

  it('frames a page with no own links as it is; where no browser parser can check a copy, never one with them', () => {
    const plain = page('<p>No links.</p>')
    assert.equal(framed(plain), plain)
    assert.equal(framed(CITED_PAGE.text), null, 'no DOMParser here: not framed, neither changed nor with its links')
  })
})
