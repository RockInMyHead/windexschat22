<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{seo.title}}</title>
  <meta name="description" content="{{seo.description}}">
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header id="site-header">
  <nav id="primary-nav" class="container">
    <div class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div>
        <div class="brand-name">{{brand}}</div>
        <div class="brand-tagline">{{tagline}}</div>
      </div>
    </div>

    <button id="nav-toggle" type="button" aria-expanded="false" aria-label="Открыть меню">Меню</button>

    <ul class="nav-menu" id="nav-menu">
      <li><a href="#features">Преимущества</a></li>
      <li><a href="#showcase">{{tabs.0.label}}</a></li>
      <li><a href="#pricing">Тарифы</a></li>
      <li><a href="#contact">Контакты</a></li>
    </ul>

    <button id="theme-toggle" type="button" aria-label="Сменить тему">Тема</button>
  </nav>
</header>

<main id="main">
  <section id="hero" class="container">
    <div class="hero-grid">
      <div class="hero-copy">
        <h1>{{hero.title}}</h1>
        <p class="muted">{{hero.subtitle}}</p>
        <div class="hero-cta">
          <a class="btn primary" href="#contact">{{hero.primaryCta}}</a>
          <a class="btn ghost" href="#showcase">{{hero.secondaryCta}}</a>
        </div>
        <div class="hero-badges">
          {{#hero.badges}}<span class="badge">{{.}}</span>{{/hero.badges}}
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <svg viewBox="0 0 360 240" role="img">
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0" stop-color="#4f8cff"/><stop offset="1" stop-color="#8a5cff"/>
            </linearGradient>
            <linearGradient id="g2" x1="0" x2="1">
              <stop offset="0" stop-color="#35d07f"/><stop offset="1" stop-color="#4f8cff"/>
            </linearGradient>
          </defs>
          <circle cx="250" cy="70" r="70" fill="url(#g1)" opacity="0.85"/>
          <circle cx="120" cy="150" r="80" fill="url(#g2)" opacity="0.35"/>
          <path d="M70 175c55-70 165-70 220 0" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.18" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  </section>

  <section id="features">
    <div class="container">
      <h2>Почему выбирают нас</h2>
      <div class="features-grid">
        {{#features}}
        <article class="card">
          <div class="icon" aria-hidden="true">{{icon}}</div>
          <h3>{{title}}</h3>
          <p class="muted">{{text}}</p>
        </article>
        {{/features}}
      </div>
    </div>
  </section>

  <section id="showcase">
    <div class="container">
      <h2>{{tabs.0.label}}</h2>
      <div class="tab-buttons">
        <button class="tab active" data-tab="services" type="button">{{tabs.0.label}}</button>
        <button class="tab" data-tab="cases" type="button">{{tabs.1.label}}</button>
        <button class="tab" data-tab="reviews" type="button">{{tabs.2.label}}</button>
      </div>

      <div class="tab-panel active" id="services">
        <div class="product-grid">
          {{#tabs.0.cards}}
          <article class="product-card">
            <h4>{{title}}</h4>
            <p class="muted">{{text}}</p>
            <div class="row">
              <span class="meta">{{meta}}</span>
              <a class="btn small" href="#contact" data-order="{{title}}">Запросить</a>
            </div>
          </article>
          {{/tabs.0.cards}}
        </div>
      </div>

      <div class="tab-panel" id="cases">
        <div class="product-grid">
          {{#tabs.1.cards}}
          <article class="product-card">
            <h4>{{title}}</h4>
            <p class="muted">{{text}}</p>
            <div class="row">
              <span class="meta">{{meta}}</span>
              <a class="btn small" href="#contact" data-order="{{title}}">Уточнить</a>
            </div>
          </article>
          {{/tabs.1.cards}}
        </div>
      </div>

      <div class="tab-panel" id="reviews">
        <div class="product-grid">
          {{#tabs.2.cards}}
          <article class="product-card">
            <h4>{{title}}</h4>
            <p class="muted">{{text}}</p>
            <div class="row">
              <span class="meta">{{meta}}</span>
              <a class="btn small" href="#contact" data-order="{{title}}">Связаться</a>
            </div>
          </article>
          {{/tabs.2.cards}}
        </div>
      </div>
    </div>
  </section>

  <section id="pricing">
    <div class="container">
      <h2>Тарифы</h2>
      <div class="pricing-grid">
        {{#pricing}}
        <article class="pricing-card {{#featured}}featured{{/featured}}">
          <h3>{{name}}</h3>
          <div class="price">{{price}}</div>
          <ul class="bullets">
            {{#bullets}}<li>{{.}}</li>{{/bullets}}
          </ul>
          <button class="btn primary" type="button" data-order="{{name}}">Выбрать</button>
        </article>
        {{/pricing}}
      </div>
    </div>
  </section>

  <section id="faq">
    <div class="container">
      <h2>FAQ</h2>
      <div class="accordion">
        {{#faq}}
        <div class="accordion-item">
          <button class="accordion-trigger" type="button" aria-expanded="false">{{q}}</button>
          <div class="accordion-content" hidden>
            <p class="muted">{{a}}</p>
          </div>
        </div>
        {{/faq}}
      </div>
    </div>
  </section>

  <section id="contact">
    <div class="container">
      <h2>Контакты</h2>

      <div class="contact-grid">
        <div class="contact-card">
          <div class="k">Телефон</div><div class="v">{{contact.phone}}</div>
          <div class="k">Email</div><div class="v">{{contact.email}}</div>
          <div class="k">Адрес</div><div class="v">{{contact.address}}</div>
          <div class="k">Часы</div><div class="v">{{contact.hours}}</div>
        </div>

        <form id="contact-form" class="form">
          <label>Имя
            <input id="name" name="name" required />
          </label>
          <label>Email
            <input id="email" name="email" type="email" required />
          </label>
          <label>Тема
            <select id="topic" name="topic" required>
              <option value="consult">Консультация</option>
              <option value="order">Запрос</option>
              <option value="pricing">Тарифы</option>
            </select>
          </label>
          <label>Сообщение
            <textarea id="message" name="message" required></textarea>
          </label>
          <label class="consent">
            <input name="consent" type="checkbox" required />
            Согласен на обработку данных
          </label>
          <button class="btn primary" type="submit">Отправить</button>
          <div id="form-status" aria-live="polite"></div>
        </form>
      </div>
    </div>
  </section>
</main>

<footer id="site-footer">
  <div class="container footer-row">
    <div>© {{year}} {{brand}}</div>
    <a href="#hero">Наверх</a>
  </div>
</footer>

<button id="to-top" type="button" aria-label="Наверх">↑</button>
<div id="toast" role="status" aria-live="polite"></div>

<script defer src="/app.js"></script>
</body>
</html>
