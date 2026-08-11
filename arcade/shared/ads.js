// Built by Bots Arcade -- shared ad-slot module.
// Direct-sold placements, no ad network, no revenue share. Edit AD_SLOTS
// below to sell a slot; unset/missing slots fall back to a "YOUR AD HERE"
// house creative that links to the advertise-with-us contact.
//
// This is the first real thing to live in a shared/ file across games --
// GDD-INDEX.md documented a shared/ module architecture (crt.js, dither.js,
// palette.js, etc.) but as of 2026-08 nothing had actually been extracted;
// every game shipped as a fully self-contained HTML file instead. An ad
// system is the one thing that actually NEEDS to be centralized -- selling
// a slot should update everywhere it's used, not require editing every game
// file individually -- so it's the first thing worth breaking that pattern
// for. Kept intentionally tiny and dependency-free so including it doesn't
// undermine the no-build-step simplicity every other game relies on.
//
// Usage in a game's HTML:
//   <script src="/arcade/shared/ads.js"></script>
//   <div class="ad-slot" data-ad-slot="air-hockey-top"></div>
//   <script>BBBAds.renderAll();</script>

(function (root) {
  'use strict';

  const CONTACT_EMAIL = 'builtbybots@eonic.cloud';
  const CONTACT_SUBJECT = 'Advertise on the Built by Bots Arcade';
  const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`;

  // --- Sold slots go here. Empty = every slot is unsold (house ad shows). ---
  // Shape: { advertiser: string, imageUrl: string, linkUrl: string, alt: string }
  const AD_SLOTS = {
    // 'air-hockey-top': { advertiser: 'Example Co', imageUrl: '/assets/ads/example.png',
    //   linkUrl: 'https://example.com', alt: 'Example Co -- your product here' },
  };

  // House (unsold) copy per slot kind. 'sponsor' is pitched differently from
  // the others deliberately -- a presenting-sponsor credit is a different,
  // usually higher-value sell than a banner impression, so it shouldn't read
  // like generic ad inventory.
  const HOUSE_COPY = {
    banner: { label: 'YOUR AD HERE', sub: '' },
    skyscraper: { label: 'YOUR AD HERE', sub: '' },
    panel: { label: 'Advertise on this game', sub: 'Direct-sold, no network cut. Reach players while they play.' },
    sponsor: { label: 'Sponsor this game', sub: '' },
  };

  function houseAdHTML(kind) {
    const copy = HOUSE_COPY[kind] || HOUSE_COPY.banner;
    const sub = copy.sub ? `<div class="bbb-ad-sub">${copy.sub}</div>` : '';
    return `<a class="bbb-ad bbb-ad-house bbb-ad-${kind}" href="${CONTACT_HREF}" target="_blank" rel="noopener">
      <span class="bbb-ad-label">${copy.label}</span>${sub}
    </a>`;
  }

  function soldAdHTML(slot, kind) {
    if (kind === 'sponsor') {
      // Text credit line, not an image banner -- "PRESENTED BY X", optionally
      // with a small logo if the advertiser supplied one.
      const logo = slot.imageUrl ? `<img src="${slot.imageUrl}" alt="${slot.alt || slot.advertiser}" loading="lazy">` : '';
      return `<a class="bbb-ad bbb-ad-sold bbb-ad-sponsor" href="${slot.linkUrl}" target="_blank" rel="noopener sponsored">
        <span class="bbb-ad-sponsor-label">Presented by</span> ${logo}<span class="bbb-ad-sponsor-name">${slot.advertiser}</span>
      </a>`;
    }
    return `<a class="bbb-ad bbb-ad-sold bbb-ad-${kind}" href="${slot.linkUrl}" target="_blank" rel="noopener sponsored">
      <img src="${slot.imageUrl}" alt="${slot.alt || slot.advertiser}" loading="lazy">
    </a>`;
  }

  function renderSlot(el) {
    const id = el.getAttribute('data-ad-slot');
    // 'banner' (in-game edge), 'skyscraper' (vertical, flanks wide layouts),
    // 'panel' (below description), 'sponsor' (text credit line by the title)
    const kind = el.getAttribute('data-ad-kind') || 'banner';
    const slot = AD_SLOTS[id];
    el.innerHTML = slot ? soldAdHTML(slot, kind) : houseAdHTML(kind);
    el.classList.add('bbb-ad-slot-rendered');
  }

  function renderAll() {
    document.querySelectorAll('[data-ad-slot]').forEach(renderSlot);
  }

  root.BBBAds = { renderAll, CONTACT_HREF, CONTACT_EMAIL };
})(typeof window !== 'undefined' ? window : this);
