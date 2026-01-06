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
      <div class="sig">{{brand}}</div>
      <div class="sub">{{tagline}}</div>
    </div>

    <button id="nav-toggle" type="button" aria-expanded="false">Разделы</button>

    <ul class="nav-menu">
      <li><a href="#hero">Вступление</a></li>
      <li><a href="#features">Позиционирование</a></li>
      <li><a href="#showcase">Материалы</a></li>
      <li><a href="#pricing">Условия</a></li>
      <li><a href="#contact">Контакт</a></li>
    </ul>

    <button id="theme-toggle" type="button">Тема</button>
  </nav>
</header>

<main id="main">
  <section id="hero" class="container reveal">
    <div class="mag">
      <div class="lead">
        <h1>{{hero.title}}</h1>
        <p class="lede">{{hero.subtitle}}</p>
        <div class="hero-cta">
          <a class="btn primary" href="#contact">{{hero.primaryCta}}</a>
          <a class="btn ghost" href="#showcase">{{hero.secondaryCta}}</a>
        </div>

        <div class="badges">
          {{#hero.badges}}<span class="badge">{{.}}</span>{{/hero.badges}}
        </div>
      </div>

      <aside class="side">
        <div class="side-card">
          <div class="k">Контакт</div>
          <div class="v">{{contact.phone}}</div>
          <div class="k">Почта</div>
          <div class="v">{{contact.email}}</div>
          <div class="k">Режим</div>
          <div class="v">{{contact.hours}}</div>
          <button class="btn small primary" type="button" data-order="Быстрый бриф">Быстрый бриф</button>
        </div>

        <div class="pattern" aria-hidden="true">
          <svg viewBox="0 0 240 180">
            <defs>
              <linearGradient id="pg" x1="0" x2="1">
                <stop offset="0" stop-color="#0a84ff" stop-opacity=".35"/>
                <stop offset="1" stop-color="#ff375f" stop-opacity=".25"/>
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="240" height="180" fill="url(#pg)"/>
            <path d="M20 150c30-70 90-70 120 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="8" stroke-linecap="round"/>
            <circle cx="190" cy="46" r="18" fill="rgba(255,255,255,.45)"/>
          </svg>
        </div>
      </aside>
    </div>
  </section>

  <section id="features" class="reveal">
    <div class="container">
      <h2>Позиционирование</h2>
      <div class="rail">
        {{#features}}
        <article class="note">
          <div class="cap">
            <span class="ico" aria-hidden="true">{{icon}}</span>
            <h3>{{title}}</h3>
          </div>
          <p>{{text}}</p>
        </article>
        {{/features}}
      </div>
    </div>
  </section>

  <section id="showcase" class="reveal">
    <div class="container">
      <div class="section-head">
        <h2>Материалы</h2>
        <p class="muted">Табы переключают разные форматы представления.</p>
      </div>

      <div class="tab-buttons">
        <button class="tab active" type="button" data-tab="services" aria-selected="true">{{tabs.0.label}}</button>
        <button class="tab" type="button" data-tab="cases" aria-selected="false">{{tabs.1.label}}</button>
        <button class="tab" type="button" data-tab="reviews" aria-selected="false">{{tabs.2.label}}</button>
      </div>

      <div class="tab-panel active" id="services" aria-hidden="false">
        <div class="cards">
          {{#tabs.0.cards}}
          <article class="story">
            <header>
              <h4>{{title}}</h4>
              <span class="meta">{{meta}}</span>
            </header>
            <p>{{text}}</p>
            <a class="btn small" href="#contact" data-order="{{title}}">Запросить</a>
          </article>
          {{/tabs.0.cards}}
        </div>
      </div>

      <div class="tab-panel" id="cases" aria-hidden="true">
        <div class="timeline">
          {{#tabs.1.cards}}
          <div class="t-item">
            <div class="dot" aria-hidden="true"></div>
            <div class="t-body">
              <div class="t-top">
                <b>{{title}}</b>
                <span class="meta">{{meta}}</span>
              </div>
              <div class="muted">{{text}}</div>
              <a class="btn small ghost" href="#contact" data-order="{{title}}">Обсудить</a>
            </div>
          </div>
          {{/tabs.1.cards}}
        </div>
      </div>

      <div class="tab-panel" id="reviews" aria-hidden="true">
        <div class="columns">
          {{#tabs.2.cards}}
          <blockquote class="pull">
            <p>"{{text}}"</p>
            <footer>— {{title}} <span class="meta">{{meta}}</span></footer>
          </blockquote>
          {{/tabs.2.cards}}
        </div>
      </div>
    </div>
  </section>

  <section id="pricing" class="reveal">
    <div class="container">
      <h2>Условия</h2>
      <div class="pricing">
        {{#pricing}}
        <article class="tariff {{#featured}}featured{{/featured}}">
          <div class="top">
            <h3>{{name}}</h3>
            <div class="price">{{price}}</div>
          </div>
          <ul>
            {{#bullets}}<li>{{.}}</li>{{/bullets}}
          </ul>
          <button class="btn primary" type="button" data-order="{{name}}">Выбрать</button>
        </article>
        {{/pricing}}
      </div>
    </div>
  </section>

  <section id="faq" class="reveal">
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

  <section id="contact" class="reveal">
    <div class="container">
      <h2>Контакт</h2>
      <div class="contact">
        <form id="contact-form" class="form">
          <div class="grid">
            <label>Имя <input id="name" name="name" required></label>
            <label>Email <input id="email" name="email" type="email" required></label>
          </div>
          <label>Тема
            <select id="topic" name="topic" required>
              <option value="consult">Консультация</option>
              <option value="order">Запрос</option>
              <option value="pricing">Тариф</option>
            </select>
          </label>
          <label>Сообщение <textarea id="message" name="message" required></textarea></label>
          <label class="consent"><input name="consent" type="checkbox" required> Согласен на обработку данных</label>
          <button class="btn primary" type="submit">Отправить</button>
          <div id="form-status" aria-live="polite"></div>
        </form>

        <div class="info">
          <div class="line"><span>Телефон</span><b>{{contact.phone}}</b></div>
          <div class="line"><span>Email</span><b>{{contact.email}}</b></div>
          <div class="line"><span>Адрес</span><b>{{contact.address}}</b></div>
          <div class="line"><span>Часы</span><b>{{contact.hours}}</b></div>
          <a class="btn ghost" href="#hero">Вернуться к началу</a>
        </div>
      </div>
    </div>
  </section>
</main>

<footer id="site-footer">
  <div class="container foot">
    <div>© {{year}} {{brand}}</div>
    <a href="#hero">Наверх</a>
  </div>
</footer>

<button id="to-top" type="button">↑</button>
<div id="toast" role="status" aria-live="polite"></div>
<script defer src="/app.js"></script>
</body>
</html>