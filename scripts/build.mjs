import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, readableOn, inkFor, controlColor } from "./color.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const contentPath = path.join(root, "content.json");

const PHONE_RE =
  /(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}/;

const data = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const raw = fs.readFileSync(contentPath, "utf8");
if (PHONE_RE.test(raw)) {
  throw new Error("content.json contains a phone number. Remove it before building.");
}

const placeholders = [];

function isTodo(value) {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("todo:");
}

function show(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || isTodo(text)) return "";
  return text;
}

function walk(value, trail) {
  if (typeof value === "string") {
    if (isTodo(value)) {
      placeholders.push({
        path: trail,
        text: value.replace(PHONE_RE, "[redacted phone]"),
      });
    }
    if (PHONE_RE.test(value)) {
      throw new Error(`Phone number found at ${trail}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${trail}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (key === "_readme") return;
      walk(item, trail ? `${trail}.${key}` : key);
    });
  }
}

walk(data, "");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch],
  );
}

function safeUrl(href) {
  const value = String(href || "").trim();
  if (
    value.startsWith("/") ||
    value.startsWith("#") ||
    value.startsWith("mailto:") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  ) {
    return value;
  }
  return "";
}

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function searchAttrs(kind, tags, parts) {
  const blob = parts.filter(Boolean).join(" ");
  const tagList = (tags || []).map(show).filter(Boolean);
  return ` data-filter-item data-kind="${esc(kind)}" data-tags="${esc(tagList.join("|"))}" data-search="${esc(fold(blob))}" data-compact="${esc(compact(blob))}"`;
}

function assertTags(tags, where) {
  const allowed = new Set(data.filters.tags);
  (tags || []).forEach((tag) => {
    if (!allowed.has(tag)) {
      throw new Error(`Unknown tag "${tag}" on ${where}. Use filters.tags labels.`);
    }
  });
}

function dateRange(start, end) {
  const a = show(start);
  const b = show(end);
  if (a && b) return `${a} to ${b}`;
  return a || b;
}

function joinMeta(parts) {
  return parts.map(show).filter(Boolean).join(" · ");
}

function jsonScript(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const theme = data.theme;
const darkBg = [theme.dark.bg, theme.dark.surface];
const lightBg = [theme.light.bg, theme.light.surface];

function checkPair(name, fg, bg, min) {
  const ratio = contrast(fg, bg);
  if (ratio < min) {
    throw new Error(`${name} contrast ${ratio.toFixed(2)} is below ${min} (${fg} on ${bg})`);
  }
  return ratio;
}

checkPair("dark text", theme.dark.text, theme.dark.bg, 4.5);
checkPair("dark text surface", theme.dark.text, theme.dark.surface, 4.5);
checkPair("dark muted", theme.dark.muted, theme.dark.bg, 4.5);
checkPair("dark muted surface", theme.dark.muted, theme.dark.surface, 4.5);
checkPair("light text", theme.light.text, theme.light.bg, 4.5);
checkPair("light text surface", theme.light.text, theme.light.surface, 4.5);
checkPair("light muted", theme.light.muted, theme.light.bg, 4.5);
checkPair("light muted surface", theme.light.muted, theme.light.surface, 4.5);

const darkAccentText = readableOn(theme.accent, darkBg, 4.5);
const lightAccentText = readableOn(theme.accent, lightBg, 4.5);
const darkOnAccent = inkFor(theme.accent, theme.dark.bg, "#FFFFFF");
const lightOnAccent = inkFor(theme.accent, theme.light.text, "#FFFFFF");
checkPair("dark button label", darkOnAccent, theme.accent, 4.5);
checkPair("light button label", lightOnAccent, theme.accent, 4.5);
checkPair("dark accent text", darkAccentText, theme.dark.bg, 4.5);
checkPair("light accent text", lightAccentText, theme.light.bg, 4.5);
checkPair("light accent text surface", lightAccentText, theme.light.surface, 4.5);

const darkControl = controlColor(theme.dark.border, theme.dark.muted, darkBg, 3);
const lightControl = controlColor(theme.light.border, theme.light.text, lightBg, 3);

const fontSans = theme.fonts.sans;
const fontMono = theme.fonts.mono;

const themeCss = `:root {
  color-scheme: dark;
  --bg: ${theme.dark.bg};
  --surface: ${theme.dark.surface};
  --text: ${theme.dark.text};
  --muted: ${theme.dark.muted};
  --border: ${theme.dark.border};
  --accent: ${theme.accent};
  --accent-text: ${darkAccentText};
  --on-accent: ${darkOnAccent};
  --control: ${darkControl};
  --grid: color-mix(in srgb, ${theme.dark.border} 85%, transparent);
  --sans: ${fontSans};
  --mono: ${fontMono};
}
html[data-theme="light"] {
  color-scheme: light;
  --bg: ${theme.light.bg};
  --surface: ${theme.light.surface};
  --text: ${theme.light.text};
  --muted: ${theme.light.muted};
  --border: ${theme.light.border};
  --accent: ${theme.accent};
  --accent-text: ${lightAccentText};
  --on-accent: ${lightOnAccent};
  --control: ${lightControl};
  --grid: color-mix(in srgb, ${theme.light.border} 90%, transparent);
}
`;

const fontFace = `@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/assets/fonts/inter-latin-400.woff2") format("woff2");
}
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/assets/fonts/inter-latin-500.woff2") format("woff2");
}
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/assets/fonts/inter-latin-600.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/assets/fonts/jetbrains-mono-latin-400.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/assets/fonts/jetbrains-mono-latin-500.woff2") format("woff2");
}
`;

const siteUrl = data.meta.url.replace(/\/$/, "");
const email = show(data.contact.email);
if (!email || !email.includes("@")) {
  throw new Error("contact.email is required");
}

const sameAs = (data.meta.sameAs || []).map(show).filter((url) => safeUrl(url).startsWith("http"));
const linkedin = show(data.meta.linkedin);
if (linkedin && safeUrl(linkedin).startsWith("http")) sameAs.push(linkedin);

const personLd = {
  "@context": "https://schema.org",
  "@type": data.meta.jsonLdType || "Person",
  name: data.meta.legalName,
  alternateName: data.meta.siteName,
  url: siteUrl + "/",
  jobTitle: data.meta.jobTitle,
  email,
  address: {
    "@type": "PostalAddress",
    addressLocality: data.meta.locality,
    addressRegion: data.meta.region,
    addressCountry: data.meta.country,
  },
  sameAs,
};

const ogImage = show(data.meta.ogImage) || "/og.png";

function nameLines(name) {
  const parts = show(name).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [show(name)];
  return [parts[0], parts.slice(1).join(" ")];
}

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${theme.dark.bg}"/>
  <rect width="3" height="32" fill="${theme.accent}"/>
  <text x="18.5" y="21" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="${theme.dark.text}">${esc(data.hero.monogram || "AJ")}</text>
</svg>
`;

function head({ title, description, canonical, jsonLd, extra = "" }) {
  const allow = theme.allowToggle !== false;
  return `<!DOCTYPE html>
<html lang="en" data-default-theme="${esc(theme.default || "dark")}" data-allow-toggle="${allow ? "true" : "false"}" data-color-dark="${esc(theme.dark.bg)}" data-color-light="${esc(theme.light.bg)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(data.meta.siteName)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="theme-color" content="${esc(theme.dark.bg)}">
  <meta property="og:site_name" content="${esc(data.meta.siteName)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(siteUrl + ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(data.meta.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(siteUrl + ogImage)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/inter-latin-600.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/site.css">
  <script type="application/ld+json">${jsonScript(jsonLd)}</script>
  <script>
    (function () {
      var root = document.documentElement;
      var fallback = root.getAttribute("data-default-theme") || "dark";
      var allowToggle = root.getAttribute("data-allow-toggle") !== "false";
      var themeName = fallback;
      if (allowToggle) {
        try {
          var stored = localStorage.getItem("theme");
          if (stored === "light" || stored === "dark") themeName = stored;
        } catch (err) {}
      }
      root.classList.add("js");
      root.setAttribute("data-theme", themeName);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute("content", themeName === "light" ? root.getAttribute("data-color-light") : root.getAttribute("data-color-dark"));
      }
    })();
  </script>
  ${extra}
</head>`;
}

function nav(current) {
  const links = [
    ["Services", "/#services"],
    ["Work", "/#work"],
    ["Skills", "/#skills"],
    ["Experience", "/#experience"],
    ["Résumé", "/resume.html"],
  ];
  const items = links
    .map(([label, href]) => {
      const currentAttr = current === href ? ' aria-current="page"' : "";
      return `<a href="${esc(href)}"${currentAttr}>${esc(label)}</a>`;
    })
    .join("");
  const toggle = theme.allowToggle === false
    ? ""
    : `<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="true">Light</button>`;
  return `<header class="site-header">
    <div class="wrap bar">
      <a class="brand" href="/" aria-label="${esc(data.hero.name)}">
        <span class="brand-mark" aria-hidden="true">${esc(data.hero.monogram || "AJ")}</span>
        <span class="brand-name">${esc(data.hero.name)}</span>
      </a>
      <nav class="nav-inline" aria-label="Primary">${items}</nav>
      <div class="bar-actions">
        <a class="btn btn-primary btn-small" href="/#contact">Hire me</a>
        ${toggle}
        <details class="nav-drawer">
          <summary>Menu</summary>
          <nav aria-label="Primary">${items}</nav>
        </details>
      </div>
    </div>
  </header>`;
}

function footer() {
  const links = (data.footer.links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href || !show(link.label)) return "";
      return `<a href="${esc(href)}">${esc(link.label)}</a>`;
    })
    .filter(Boolean)
    .join("");
  return `<footer class="site-footer">
    <div class="wrap">
      <p>${esc(show(data.footer.tagline))}</p>
      <nav aria-label="Footer">${links}</nav>
    </div>
  </footer>`;
}

function page({ title, description, canonical, jsonLd, body, current }) {
  return `${head({ title, description, canonical, jsonLd })}
<body>
  <a class="skip" href="#content">Skip to content</a>
  ${nav(current)}
  <main id="content">${body}</main>
  ${footer()}
  <script src="/assets/site.js"></script>
</body>
</html>
`;
}

function hero() {
  const photo = show(data.hero.photo);
  const photoOk = photo && /^(?:\/|https?:|\.{1,2}\/|assets\/)/.test(photo);
  const mark = photoOk
    ? `<div class="mark mark-photo"><picture>${photo.endsWith(".webp") ? `<source srcset="${esc(photo)}" type="image/webp">` : ""}<img src="${esc(photo.replace(/\.webp$/, ".jpg"))}" alt="${esc(data.hero.name)}" width="600" height="600" decoding="async" fetchpriority="high"></picture></div>`
    : `<div class="mark" aria-hidden="true"><span>${esc(data.hero.monogram || "AJ")}</span></div>`;
  const lines = nameLines(data.hero.name)
    .map((line) => `<span>${esc(line)}</span>`)
    .join("");
  const chips = (data.hero.proofChips || [])
    .map(show)
    .filter(Boolean)
    .map((chip) => `<li>${esc(chip)}</li>`)
    .join("");
  const primary = safeUrl(data.hero.primaryCta.href);
  const secondary = safeUrl(data.hero.secondaryCta.href);
  const resume = safeUrl(data.hero.resumeCta.href);
  return `<section class="hero wrap">
    <div>
      <p class="eyebrow">${esc(show(data.hero.eyebrow))}</p>
      <h1>${lines}</h1>
      <p class="headline">${esc(show(data.hero.headline))}</p>
      <p class="subhead">${esc(show(data.hero.subhead))}</p>
      <div class="actions">
        <a class="btn btn-primary" href="${esc(primary)}">${esc(data.hero.primaryCta.label)}</a>
        <a class="btn btn-ghost" href="${esc(secondary)}">${esc(data.hero.secondaryCta.label)}</a>
        <a class="text-link" href="${esc(resume)}">${esc(data.hero.resumeCta.label)}</a>
      </div>
      <ul class="proof">${chips}</ul>
    </div>
    ${mark}
  </section>`;
}

function searchBand() {
  const chips = [`<button type="button" class="chip" data-tag-chip data-tag="" aria-pressed="true">All</button>`]
    .concat(
      data.filters.tags.map(
        (tag) =>
          `<button type="button" class="chip" data-tag-chip data-tag="${esc(tag)}" aria-pressed="false">${esc(tag)}</button>`,
      ),
    )
    .join("");
  return `<div class="searchband">
    <div class="wrap">
      <form class="search-form" action="/" method="get" role="search" data-live-search>
        <label class="sr-only" for="q">${esc(data.search.placeholder)}</label>
        <div class="search-field">
          <span class="search-prompt" aria-hidden="true">/</span>
          <input id="q" type="search" name="q" placeholder="${esc(data.search.placeholder)}" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="search-hint">
          <kbd data-kbd>Ctrl K</kbd>
        </div>
      </form>
      <p class="hint" id="search-hint">${esc(show(data.search.hint))}</p>
      <noscript><p class="hint">JavaScript is off, so the full list stays visible and these filters will not narrow it.</p></noscript>
      <div class="filters" role="group" aria-label="${esc(data.filters.label)}">${chips}</div>
      <p class="results" data-count aria-live="polite"></p>
      <p class="global-empty" data-global-empty data-message="${esc(show(data.search.emptyState))}" hidden></p>
    </div>
  </div>`;
}

function sectionHead(index, title, intro) {
  return `<header class="section-head">
    <p class="idx">${esc(show(index))}</p>
    <div>
      <h2>${esc(show(title))}</h2>
      ${intro ? `<p class="lede">${esc(intro)}</p>` : ""}
    </div>
  </header>`;
}

function servicesSection() {
  const items = data.services.items
    .map((item) => {
      assertTags(item.tags, item.name);
      const tags = (item.tags || []).join(" · ");
      return `<article class="service"${searchAttrs("service", item.tags, [item.name, item.body, tags])}>
        <h3>${esc(item.name)}</h3>
        <div>
          <p>${esc(item.body)}</p>
          <p class="tagline">${esc(tags)}</p>
        </div>
      </article>`;
    })
    .join("");
  return `<section class="section" id="services" data-filter-section>
    <div class="wrap">
      ${sectionHead(data.services.sectionIndex, data.services.title, show(data.services.intro))}
      <div class="services">${items}</div>
      <p class="empty" data-empty hidden>Nothing in this section matches.</p>
    </div>
  </section>`;
}

function engageSection() {
  const steps = data.howToEngage.steps
    .map(
      (step) => `<article class="step">
        <p class="num">${esc(step.step)}</p>
        <h3>${esc(step.name)}</h3>
        <p>${esc(step.body)}</p>
      </article>`,
    )
    .join("");
  return `<section class="section" id="engage" data-unfiltered-only>
    <div class="wrap">
      ${sectionHead(data.howToEngage.sectionIndex, data.howToEngage.title, "")}
      <div class="steps">${steps}</div>
    </div>
  </section>`;
}

function projectArticle(project) {
  assertTags(project.tags, project.name);
  const stack = (project.stack || []).map((item) => `<li>${esc(item)}</li>`).join("");
  const links = (project.links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href || !show(link.label)) return "";
      const external = href.startsWith("http") ? ' rel="noopener noreferrer" target="_blank"' : "";
      return `<li><a href="${esc(href)}"${external}>${esc(link.label)}</a></li>`;
    })
    .filter(Boolean)
    .join("");
  const featured = project.featured ? " is-featured" : "";
  const blob = [
    project.name,
    project.role,
    project.oneLiner,
    project.detail,
    project.status,
    ...(project.stack || []),
    ...(project.tags || []),
    ...(project.links || []).map((link) => `${link.label} ${link.href}`),
  ];
  return `<article class="project${featured}" id="${esc(project.slug)}" data-slug="${esc(project.slug)}"${searchAttrs("project", project.tags, blob)}>
    <div class="project-top">
      <h3><a href="/work/${esc(project.slug)}.html">${esc(project.name)}</a></h3>
      <p class="status">${esc(show(project.status))}</p>
    </div>
    <p class="role-line">${esc(show(project.role))}</p>
    <p class="oneliner">${esc(show(project.oneLiner))}</p>
    <ul class="stack">${stack}</ul>
    <button type="button" class="case-toggle" aria-expanded="false" aria-controls="case-${esc(project.slug)}">Case study</button>
    <div class="case" id="case-${esc(project.slug)}">
      <p>${esc(show(project.detail))}</p>
      ${links ? `<ul class="links">${links}</ul>` : ""}
      <p><a href="/work/${esc(project.slug)}.html">Full case study page</a></p>
    </div>
  </article>`;
}

function workSection() {
  const projects = data.work.projects.map(projectArticle).join("");
  const more = show(data.work.moreWorkNote);
  const client = clientWorkBlock();
  return `<section class="section" id="work" data-filter-section>
    <div class="wrap">
      ${sectionHead(data.work.sectionIndex, data.work.title, show(data.work.intro))}
      <div class="work-list" id="work-list">${projects}</div>
      <p class="empty" data-empty hidden>Nothing in this section matches.</p>
      ${more ? `<p class="more-note" data-unfiltered-only>${esc(more)}</p>` : ""}
      ${client}
    </div>
  </section>`;
}

function skillsSection() {
  const groups = data.skills.groups
    .map((group) => {
      assertTags(group.tags || [], group.name);
      const buttons = group.items
        .map((item) => {
          const blob = [group.name, item, ...(group.tags || [])];
          return `<button type="button" class="skill" data-skill-query="${esc(item)}"${searchAttrs("skill", group.tags || [], blob)}>${esc(item)}</button>`;
        })
        .join("");
      return `<div class="skill-group" data-filter-group>
        <h3>${esc(group.name)}</h3>
        <div class="skill-cloud">${buttons}</div>
      </div>`;
    })
    .join("");
  return `<section class="section" id="skills" data-filter-section>
    <div class="wrap">
      ${sectionHead(data.skills.sectionIndex, data.skills.title, show(data.skills.intro))}
      <div class="skills">${groups}</div>
      <p class="empty" data-empty hidden>Nothing in this section matches.</p>
    </div>
  </section>`;
}

function experienceSection() {
  const roles = data.experience.roles
    .map((role) => {
      assertTags(role.tags || [], role.title);
      const bullets = (role.bullets || []).map((bullet) => `<li>${esc(bullet)}</li>`).join("");
      const when = dateRange(role.start, role.end);
      const note = show(role.note);
      const blob = [role.title, role.org, role.location, when, ...(role.bullets || []), ...(role.tags || [])];
      return `<article class="role"${searchAttrs("role", role.tags || [], blob)}>
        <div class="when">
          ${when ? `<p>${esc(when)}</p>` : ""}
          ${show(role.location) ? `<p>${esc(role.location)}</p>` : ""}
        </div>
        <div>
          <h3>${esc(role.title)}</h3>
          ${show(role.org) ? `<p class="org">${esc(role.org)}</p>` : ""}
          <ul>${bullets}</ul>
          ${note ? `<p class="role-note">${esc(note)}</p>` : ""}
        </div>
      </article>`;
    })
    .join("");
  const earlier = show(data.experience.earlierCareerNote);
  return `<section class="section" id="experience" data-filter-section>
    <div class="wrap">
      ${sectionHead(data.experience.sectionIndex, data.experience.title, "")}
      <div class="roles">${roles}</div>
      <p class="empty" data-empty hidden>Nothing in this section matches.</p>
      ${earlier ? `<p class="more-note" data-unfiltered-only>${esc(earlier)}</p>` : ""}
    </div>
  </section>`;
}

function educationSection() {
  const items = data.education.items
    .map((item) => {
      const meta = joinMeta([item.org, item.year]);
      const blob = [item.credential, item.org, item.year];
      return `<article class="study"${searchAttrs("study", [], blob)}>
        <h3>${esc(show(item.credential))}</h3>
        <div>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}</div>
      </article>`;
    })
    .join("");
  return `<section class="section" id="education" data-filter-section>
    <div class="wrap">
      ${sectionHead(data.education.sectionIndex, data.education.title, "")}
      <div class="studies">${items}</div>
      <p class="empty" data-empty hidden>Nothing in this section matches.</p>
    </div>
  </section>`;
}

function contactSection() {
  const availability = show(data.contact.availability);
  const rate = show(data.contact.rate);
  const phone = show(data.contact.phone);
  if (phone) throw new Error("contact.phone must stay empty on the public site");
  const links = (data.contact.links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href || !show(link.label)) return "";
      return `<li><a href="${esc(href)}" rel="me noopener noreferrer">${esc(link.label)}</a></li>`;
    })
    .filter(Boolean)
    .join("");
  const meta = [availability, rate].filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join("");
  return `<section class="section contact" id="contact">
    <div class="wrap">
      ${sectionHead(data.contact.sectionIndex, data.contact.title, "")}
      <p class="pitch">${esc(show(data.contact.pitch))}</p>
      <p class="email-display"><a href="mailto:${esc(email)}">${esc(email)}</a></p>
      ${meta ? `<div class="contact-meta">${meta}</div>` : ""}
      <div class="actions">
        <a class="btn btn-primary" href="${esc(safeUrl(data.contact.primaryCta.href))}">${esc(data.contact.primaryCta.label)}</a>
        <a class="btn btn-ghost" href="${esc(safeUrl(data.contact.secondaryCta.href))}">${esc(data.contact.secondaryCta.label)}</a>
      </div>
      <ul class="contact-links">${links}</ul>
    </div>
  </section>`;
}

function homePage() {
  const sections = [
    { index: data.services.sectionIndex, html: servicesSection() },
    { index: data.howToEngage.sectionIndex, html: engageSection() },
    { index: data.work.sectionIndex, html: workSection() },
    { index: data.skills.sectionIndex, html: skillsSection() },
    { index: data.experience.sectionIndex, html: experienceSection() },
    { index: data.education.sectionIndex, html: educationSection() },
    { index: data.contact.sectionIndex, html: contactSection() },
  ].sort((a, b) => String(a.index).localeCompare(String(b.index), undefined, { numeric: true }));

  const body = `${hero()}${searchBand()}${sections.map((section) => section.html).join("")}`;
  return page({
    title: data.meta.title,
    description: data.meta.description,
    canonical: siteUrl + "/",
    jsonLd: personLd,
    body,
    current: "/",
  });
}

function casePage(project) {
  const links = (project.links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href) return "";
      return `<li><a href="${esc(href)}" rel="noopener noreferrer">${esc(link.label)}</a><br><span class="tagline">${esc(href)}</span></li>`;
    })
    .filter(Boolean)
    .join("");
  const stack = (project.stack || []).map((item) => `<li>${esc(item)}</li>`).join("");
  const creative = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.name,
    description: project.oneLiner,
    url: `${siteUrl}/work/${project.slug}.html`,
    author: { "@type": "Person", name: data.meta.legalName, url: siteUrl + "/" },
  };
  const body = `<article class="wrap case-page">
    <p class="back"><a href="/#${esc(project.slug)}">All work</a></p>
    <p class="idx">${esc(data.work.sectionIndex)}</p>
    <h1>${esc(project.name)}</h1>
    <p class="status">${esc(show(project.status))}</p>
    <p class="role-line">${esc(show(project.role))}</p>
    <p class="lede">${esc(show(project.oneLiner))}</p>
    <div class="prose"><p>${esc(show(project.detail))}</p></div>
    <h2>Stack</h2>
    <ul class="stack">${stack}</ul>
    ${links ? `<h2>Links</h2><ul class="links">${links}</ul>` : ""}
  </article>`;
  return page({
    title: `${project.name}, ${data.meta.siteName}`,
    description: project.oneLiner,
    canonical: `${siteUrl}/work/${project.slug}.html`,
    jsonLd: creative,
    body,
    current: "",
  });
}

function clientWorkBlock() {
  const block = data.work.clientWork;
  if (!block || !block.item) return "";
  if (isTodo(block.note) || isTodo(block.item.name) || !show(block.item.name)) return "";
  const links = (block.item.links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href || !show(link.label)) return "";
      return `<a href="${esc(href)}" rel="noopener noreferrer">${esc(link.label)}</a>`;
    })
    .filter(Boolean)
    .join(" · ");
  const note = show(block.note);
  return `<aside class="more-note" data-unfiltered-only>
    <p><strong>${esc(show(block.item.name))}</strong> ${esc(show(block.item.detail))}</p>
    ${note ? `<p>${esc(note)}</p>` : ""}
    ${links ? `<p>${links}</p>` : ""}
  </aside>`;
}

function resumeLinks(links) {
  return (links || [])
    .map((link) => {
      const href = safeUrl(link.href);
      if (!href) return "";
      return esc(href);
    })
    .filter(Boolean);
}

function resumePage() {
  const profiles = [
    email,
    siteUrl + "/",
    ...sameAs,
  ];
  const locality = joinMeta([
    [data.meta.locality, data.meta.region].filter(Boolean).join(", "),
  ]);
  const skills = data.skills.groups
    .map((group) => `<p><strong>${esc(group.name)}:</strong> ${esc(group.items.join(", "))}</p>`)
    .join("");
  const roles = data.experience.roles
    .map((role) => {
      const bullets = (role.bullets || []).map((bullet) => `<li>${esc(bullet)}</li>`).join("");
      return `<div class="entry">
        <h3>${esc(role.title)}</h3>
        <p class="muted">${esc(joinMeta([role.org, role.location, dateRange(role.start, role.end)]))}</p>
        <ul>${bullets}</ul>
      </div>`;
    })
    .join("");
  const projects = data.work.projects
    .map((project) => {
      const urls = resumeLinks(project.links)
        .map((href) => `<p><a href="${href}">${href}</a></p>`)
        .join("");
      return `<div class="entry">
        <h3>${esc(project.name)}</h3>
        <p class="muted">${esc(joinMeta([project.status, project.role]))}</p>
        <p>${esc(project.oneLiner)}</p>
        <p>Stack: ${esc((project.stack || []).join(", "))}</p>
        ${urls}
      </div>`;
    })
    .join("");
  const education = data.education.items
    .map((item) => {
      const meta = joinMeta([item.org, item.year]);
      return `<p><strong>${esc(show(item.credential))}</strong>${meta ? ` <span class="muted">${esc(meta)}</span>` : ""}</p>`;
    })
    .join("");
  const earlier = show(data.experience.earlierCareerNote);
  const availability = show(data.contact.availability);
  const rate = show(data.contact.rate);
  const profileHtml = profiles
    .map((item) => {
      const href = item.includes("@") ? `mailto:${item}` : item;
      return `<a href="${esc(href)}">${esc(item)}</a>`;
    })
    .join(" · ");
  const legal =
    data.meta.legalName && data.meta.legalName !== data.hero.name
      ? `<p class="identity">Legal name: ${esc(data.meta.legalName)}</p>`
      : "";
  const extra = [availability, rate].filter(Boolean);
  const body = `<div class="sheet-page">
    <p class="no-print wrap" style="padding-top:1rem"><a href="/">Back to the site</a> · <a href="/resume.pdf">Download PDF</a></p>
    <article class="sheet">
      <h1>${esc(data.hero.name)}</h1>
      ${legal}
      <p>${esc(data.meta.jobTitle)}</p>
      <p class="muted">${esc(locality)}</p>
      <p>${profileHtml}</p>
      <h2>Summary</h2>
      <p>${esc(show(data.resumeView.summary))}</p>
      <h2>Skills</h2>
      ${skills}
      <h2>Experience</h2>
      ${roles}
      ${earlier ? `<p class="block">${esc(earlier)}</p>` : ""}
      <h2>Selected work</h2>
      ${projects}
      <h2>Education</h2>
      ${education}
      ${extra.length ? `<h2>Availability</h2>${extra.map((line) => `<p>${esc(line)}</p>`).join("")}` : ""}
    </article>
  </div>`;

  return page({
    title: `${data.hero.name} résumé`,
    description: show(data.resumeView.summary),
    canonical: siteUrl + "/resume.html",
    jsonLd: personLd,
    body,
    current: "/resume.html",
  });
}

function ogCard() {
  const lines = nameLines(data.hero.name)
    .map((line) => esc(line))
    .join("<br>");
  const place = esc([data.meta.locality, data.meta.region].filter(Boolean).join(", "));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <link rel="stylesheet" href="/assets/site.css">
  <style>
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: ${theme.dark.bg}; color: ${theme.dark.text}; }
    .card { box-sizing: border-box; width: 1200px; height: 630px; padding: 68px 80px 64px 96px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
    .card:before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: ${theme.accent}; }
    .domain { font-family: ${fontMono}; color: ${darkAccentText}; letter-spacing: 0.08em; font-size: 22px; }
    .name { font-size: 92px; line-height: 0.92; letter-spacing: -0.05em; font-weight: 600; }
    .line { margin-top: 28px; max-width: 920px; font-size: 32px; line-height: 1.3; font-weight: 500; }
    .foot { font-family: ${fontMono}; color: ${theme.dark.muted}; font-size: 22px; }
  </style>
</head>
<body>
  <div class="card">
    <p class="domain">${esc(data.meta.domain)}</p>
    <div>
      <p class="name">${lines}</p>
      <p class="line">${esc(show(data.hero.headline))}</p>
    </div>
    <p class="foot">${place} · ${esc(data.meta.jobTitle)}</p>
  </div>
</body>
</html>`;
}

function sitemap() {
  const urls = [
    siteUrl + "/",
    siteUrl + "/resume.html",
    ...data.work.projects.map((project) => `${siteUrl}/work/${project.slug}.html`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n")}
</urlset>
`;
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "assets", "fonts"), { recursive: true });
fs.mkdirSync(path.join(dist, "work"), { recursive: true });

fs.writeFileSync(
  path.join(dist, "assets", "site.css"),
  fontFace + themeCss + fs.readFileSync(path.join(root, "src", "site.css"), "utf8"),
);
fs.copyFileSync(path.join(root, "src", "site.js"), path.join(dist, "assets", "site.js"));
const imagesDir = path.join(root, "src", "images");
if (fs.existsSync(imagesDir)) {
  fs.mkdirSync(path.join(dist, "assets", "images"), { recursive: true });
  for (const file of fs.readdirSync(imagesDir)) {
    fs.copyFileSync(path.join(imagesDir, file), path.join(dist, "assets", "images", file));
  }
}
for (const file of fs.readdirSync(path.join(root, "src", "fonts"))) {
  fs.copyFileSync(path.join(root, "src", "fonts", file), path.join(dist, "assets", "fonts", file));
}

fs.writeFileSync(path.join(dist, "index.html"), homePage());
fs.writeFileSync(path.join(dist, "resume.html"), resumePage());
fs.writeFileSync(path.join(dist, "favicon.svg"), faviconSvg);
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap());
fs.writeFileSync(
  path.join(dist, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);
fs.writeFileSync(path.join(dist, "og-card.html"), ogCard());

for (const project of data.work.projects) {
  if (!/^[a-z0-9-]+$/.test(project.slug)) {
    throw new Error(`Unsafe project slug: ${project.slug}`);
  }
  fs.writeFileSync(path.join(dist, "work", `${project.slug}.html`), casePage(project));
}

const htmlFiles = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
}
collect(dist);
const banned = [];
for (const file of htmlFiles) {
  if (file.endsWith("og-card.html")) continue;
  const html = fs.readFileSync(file, "utf8");
  if (html.includes("TODO:")) banned.push(`${path.relative(dist, file)} contains TODO`);
  if (PHONE_RE.test(html)) banned.push(`${path.relative(dist, file)} contains a phone number`);
}
if (!fs.readFileSync(path.join(dist, "index.html"), "utf8").includes(email)) {
  banned.push("home page is missing the contact email");
}
if (!fs.readFileSync(path.join(dist, "resume.html"), "utf8").includes(email)) {
  banned.push("resume is missing the contact email");
}
if (banned.length) {
  throw new Error(banned.join("\n"));
}

fs.writeFileSync(
  path.join(root, "placeholders.json"),
  JSON.stringify(
    {
      note: "Hidden on the site until the TODO text in content.json is replaced. The public email is confirmed and is not listed here.",
      items: placeholders,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Built ${htmlFiles.length} HTML files`);
console.log(`Accent text dark ${darkAccentText}, light ${lightAccentText}`);
console.log(`Placeholders still open: ${placeholders.length}`);
for (const item of placeholders) console.log(`- ${item.path}: ${item.text}`);
