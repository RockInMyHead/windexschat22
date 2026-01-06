(function () {
  "use strict";

  const on = (el, type, cb) => { if (el) el.addEventListener(type, cb); };
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const navToggle = qs("#nav-toggle");
  const navMenu = qs(".nav-menu");
  const themeToggle = qs("#theme-toggle");
  const html = document.documentElement;
  const header = qs("#site-header");
  const toTopButton = qs("#to-top");
  const contactForm = qs("#contact-form");
  const formStatus = qs("#form-status");
  const toast = qs("#toast");

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };

  // ===== Nav mobile =====
  const closeMenu = () => {
    if (!navMenu) return;
    navMenu.classList.remove("nav-open");
    document.body.classList.remove("no-scroll");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  };

  on(navToggle, "click", () => {
    if (!navMenu) return;
    const open = !navMenu.classList.contains("nav-open");
    navMenu.classList.toggle("nav-open", open);
    document.body.classList.toggle("no-scroll", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  qsa(".nav-menu a[href^='#']").forEach((a) => on(a, "click", () => closeMenu()));

  // ===== Theme =====
  const applyTheme = (t) => {
    if (t === "dark") html.setAttribute("data-theme", "dark");
    else html.removeAttribute("data-theme");
  };

  on(themeToggle, "click", () => {
    const isDark = html.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
    showToast(next === "dark" ? "Тёмная тема включена" : "Светлая тема включена");
  });

  // restore theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) applyTheme(savedTheme);

  // ===== Smooth scroll (anchors) =====
  qsa("#primary-nav a[href^='#']").forEach((a) => {
    on(a, "click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = qs(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // ===== Tabs =====
  const tabs = qsa(".tab");
  const panels = qsa(".tab-panel");

  const setActiveTab = (id) => {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    panels.forEach((p) => p.classList.toggle("active", p.id === id));
  };

  if (tabs.length && panels.length) {
    // init: если ни один panel не активен — активируем первый таб
    const initial = panels.find((p) => p.classList.contains("active"))?.id || tabs[0].dataset.tab;
    if (initial) setActiveTab(initial);

    tabs.forEach((tab) => {
      on(tab, "click", () => {
        const id = tab.dataset.tab;
        if (!id) return;
        setActiveTab(id);
      });
    });
  }

  // ===== Order buttons -> fill form + scroll =====
  const messageTextarea = qs("#message");
  const contactSection = qs("#contact");

  qsa("[data-order]").forEach((btn) => {
    on(btn, "click", () => {
      const name = btn.getAttribute("data-order") || "Запрос";
      if (messageTextarea) messageTextarea.value = \`Интересует: \${name}. Нужна консультация по покупке/подписке.\`;
      if (contactSection) contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(\`Ок: \${name}. Заполните форму - мы свяжемся.\`);
    });
  });

  // ===== Accordion =====
  qsa(".accordion-trigger").forEach((trigger) => {
    on(trigger, "click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
    });
  });

  // ===== Scroll UX =====
  window.addEventListener("scroll", () => {
    const y = window.scrollY || 0;

    if (header) header.classList.toggle("scrolled", y > 20);
    if (toTopButton) toTopButton.classList.toggle("visible", y > 420);
  });

  on(toTopButton, "click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ===== Form =====
  on(contactForm, "submit", (e) => {
    e.preventDefault();
    if (!contactForm) return;

    const required = qsa("input[required], select[required], textarea[required]", contactForm);
    const consent = qs("input[name='consent']", contactForm);

    let ok = true;
    required.forEach((el) => {
      const v = (el.value || "").trim();
      if (!v) ok = false;
    });
    if (consent && !consent.checked) ok = false;

    if (!ok) {
      if (formStatus) formStatus.textContent = "Пожалуйста, заполните обязательные поля и согласие.";
      showToast("Проверьте форму: обязательные поля не заполнены.");
      return;
    }

    if (formStatus) formStatus.textContent = "Заявка принята. Мы свяжемся с вами в ближайшее время.";
    showToast("Спасибо! Заявка отправлена.");
    contactForm.reset();
  });
})();
