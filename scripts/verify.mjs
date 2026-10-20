import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { startServer } from "./serve.mjs";

const artifacts = "/opt/cursor/artifacts";
fs.mkdirSync(artifacts, { recursive: true });

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];
  return candidates.find((item) => item && fs.existsSync(item));
}

function contrast(a, b) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const l1 = L(a);
  const l2 = L(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const server = await startServer(4173);
const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  else console.log(`ok ${name}`);
}

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(server.url + "/", { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);

  const homeText = await page.evaluate(() => document.body.innerText);
  check("email on home", homeText.includes("ajnthony87@gmail.com"));
  check("no TODO on home", !homeText.includes("TODO"));
  check("no client name", !homeText.includes("Jones Designs"));
  check("passokay present", homeText.includes("PassOkay"));
  check("headline present", homeText.includes("I design, build, and ship software"));

  await page.focus("body");
  await page.keyboard.press("/");
  check(
    "slash focuses search",
    (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "q",
  );

  await page.keyboard.type("passokay");
  await page.waitForFunction(() => location.search.includes("q=passokay"));
  let visibility = await page.evaluate(() => ({
    pass: !document.getElementById("passokay").hidden,
    awk: document.getElementById("awkbeats").hidden,
  }));
  check("search keeps PassOkay", visibility.pass);
  check("search hides AwkBeats", visibility.awk);

  await page.click('[data-tag=""]');
  await page.evaluate(() => {
    const input = document.getElementById("q");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-tag="Payments"]');
  await page.waitForFunction(() => location.search.includes("tag=Payments"));
  visibility = await page.evaluate(() => ({
    pass: !document.getElementById("passokay").hidden,
    damage: document.getElementById("damage-report").hidden,
    square: !document.body.innerText.includes("No matches") || !document.getElementById("awkbeats").hidden,
    awk: !document.getElementById("awkbeats").hidden,
  }));
  check("payments tag shows PassOkay", visibility.pass);
  check("payments tag shows AwkBeats", visibility.awk);
  check("payments tag hides damage-report", visibility.damage);

  await page.goto(server.url + "/?q=vision&tag=" + encodeURIComponent("iOS / Mobile"), {
    waitUntil: "networkidle0",
  });
  visibility = await page.evaluate(() => ({
    q: document.getElementById("q").value,
    pass: !document.getElementById("passokay").hidden,
    awk: document.getElementById("awkbeats").hidden,
    pressed: document.querySelector('[data-tag="iOS / Mobile"]').getAttribute("aria-pressed"),
  }));
  check("deep link query", visibility.q === "vision");
  check("deep link project", visibility.pass && visibility.awk);
  check("deep link chip", visibility.pressed === "true");

  await page.goto(server.url + "/?project=passokay", { waitUntil: "networkidle0" });
  const opened = await page.evaluate(() => {
    const project = document.getElementById("passokay");
    const button = project.querySelector(".case-toggle");
    return {
      open: project.classList.contains("is-open"),
      expanded: button.getAttribute("aria-expanded"),
      detail: project.innerText.includes("never leaves the phone"),
    };
  });
  check("project deep link opens", opened.open && opened.expanded === "true" && opened.detail);

  await page.keyboard.press("Escape");
  check(
    "escape closes case",
    await page.evaluate(() => !document.getElementById("passokay").classList.contains("is-open")),
  );

  await page.click("#passokay .case-toggle");
  check(
    "case button opens",
    await page.evaluate(() => document.getElementById("passokay").classList.contains("is-open")),
  );

  await page.keyboard.down("Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up("Control");
  check(
    "ctrl-k focuses search",
    (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "q",
  );

  await page.click("[data-theme-toggle]");
  check(
    "theme toggles to light",
    (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light",
  );
  await page.reload({ waitUntil: "networkidle0" });
  check(
    "theme persists",
    (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light",
  );

  const samples = await page.evaluate(() => {
    const parse = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const opaque = (el) => {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        const parts = bg.match(/[\d.]+/g) || [];
        const alpha = parts.length === 4 ? Number(parts[3]) : 1;
        if (alpha > 0.9) return parts.slice(0, 3).map(Number);
        node = node.parentElement;
      }
      return [255, 255, 255];
    };
    return ["body", ".subhead", ".eyebrow", ".btn-primary", ".chip[aria-pressed='true']"].map((selector) => {
      const el = document.querySelector(selector);
      return { selector, fg: parse(getComputedStyle(el).color), bg: opaque(el) };
    });
  });
  for (const sample of samples) {
    const ratio = contrast(sample.fg, sample.bg);
    const min = sample.selector === ".btn-primary" || sample.selector === ".eyebrow" ? 4.5 : 4.5;
    check(`contrast ${sample.selector}`, ratio >= min, ratio.toFixed(2));
  }

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const motion = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  check("reduced motion", motion === "auto", motion);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(server.url + "/", { waitUntil: "networkidle0" });
  await page.click(".nav-drawer > summary");
  const menuOpen = await page.evaluate(() => {
    const drawer = document.querySelector(".nav-drawer");
    const link = drawer.querySelector('a[href="/#work"]');
    const style = getComputedStyle(link);
    return drawer.open && style.display !== "none" && link.textContent.includes("Work");
  });
  check("mobile menu opens", menuOpen);

  for (const width of [360, 390, 768, 1280, 1440]) {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await page.goto(server.url + "/", { waitUntil: "networkidle0" });
    const box = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    check(`no overflow ${width}`, box.scroll <= box.client + 1, JSON.stringify(box));
  }

  async function shoot(width, shots) {
    await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "no-preference" }]);
    await page.goto(server.url + "/", { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const [name, selector] of shots) {
      if (selector) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollIntoView({ block: "start" });
        }, selector);
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await new Promise((r) => setTimeout(r, 80));
      await page.screenshot({ path: path.join(artifacts, name) });
    }
  }

  await page.emulateMediaFeatures([]);
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await shoot(1280, [
    ["desktop_hero_1280.png", null],
    ["desktop_services_1280.png", "#services"],
    ["desktop_engage_1280.png", "#engage"],
    ["desktop_work_1280.png", "#work"],
    ["desktop_skills_1280.png", "#skills"],
    ["desktop_experience_1280.png", "#experience"],
    ["desktop_contact_1280.png", "#contact"],
  ]);

  await page.goto(server.url + "/?tag=Payments", { waitUntil: "networkidle0" });
  await page.evaluate(() => document.getElementById("work").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(artifacts, "desktop_filter_payments_1280.png") });

  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.goto(server.url + "/", { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(artifacts, "desktop_hero_light_1280.png") });

  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await shoot(390, [
    ["mobile_hero_390.png", null],
    ["mobile_services_390.png", "#services"],
    ["mobile_work_390.png", "#work"],
    ["mobile_skills_390.png", "#skills"],
    ["mobile_experience_390.png", "#experience"],
    ["mobile_contact_390.png", "#contact"],
  ]);

  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  await page.goto(server.url + "/", { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(artifacts, "mobile_hero_360.png") });

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(server.url + "/work/passokay.html", { waitUntil: "networkidle0" });
  check("case page", (await page.evaluate(() => document.body.innerText)).includes("StoreKit"));
  await page.screenshot({ path: path.join(artifacts, "desktop_case_passokay_1280.png") });

  await page.goto(server.url + "/resume.html", { waitUntil: "networkidle0" });
  const resumeText = await page.evaluate(() => document.body.innerText);
  check("resume email", resumeText.includes("ajnthony87@gmail.com"));
  check("resume has no TODO", !resumeText.includes("TODO"));
  await page.screenshot({ path: path.join(artifacts, "desktop_resume_1280.png") });
  await page.emulateMediaType("print");
  await page.screenshot({ path: path.join(artifacts, "print_resume_1280.png") });

  check("no console errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error("FAILURES");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("All checks passed");
