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
      <span class="brand-dot" aria-hidden="true"></span>
      <div>
        <div class="brand-name">{{brand}}</div>
        <div class="brand-tagline">{{tagline}}</div>
      </div>
    </div>

    <button id="nav-toggle" type="button" aria-expanded="false">Меню</button>

    <ul class="nav-menu">
      <li><a href="#features">Преимущества</a></li>
      <li><a href="#showcase">Раздел</a></li>
      <li><a href="#pricing">Тарифы</a></li>
      <li><a href="#contact">Контакты</a></li>
    </ul>

    <button id="theme-toggle" type="button" aria-label="Сменить тему">Тема</button>
  </nav>
</header>

<main id="main">
  <section id="hero" class="container reveal">
    <div class="hero-wrap">
      <div class="hero-copy">
        <h1>{{hero.title}}</h1>
        <p class="muted">{{hero.subtitle}}</p>
        <div class="hero-cta">
          <a class="btn primary" href="#contact">{{hero.primaryCta}}</a>
          <a class="btn ghost" href="#showcase">{{hero.secondaryCta}}</a>
        </div>

        <div class="badges">
          {{#hero.badges}}<span class="badge">{{.}}</span>{{/hero.badges}}
        </div>
      </div>

      <div class="hero-art" aria-hidden="true">
        <div class="orb o1"></div>
        <div class="orb o2"></div>
        <div class="orb o3"></div>
        <svg viewBox="0 0 420 260">
          <path d="M45 200c70-95 260-95 330 0" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="12" stroke-linecap="round"/>
          <path d="M75 205c55-70 205-70 260 0" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  </section>

  <section id="features" class="reveal">
    <div class="container">
      <h2>Почему это работает</h2>
      <div class="grid3">
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

  <section id="showcase" class="reveal">
    <div class="container">
      <div class="section-head">
        <h2>{{tabs.0.label}}</h2>
        <p class="muted">Три режима подачи: услуги / кейсы / отзывы.</p>
      </div>

      <div class="tab-buttons" role="tablist">
        <button class="tab active" type="button" data-tab="services" aria-selected="true">{{tabs.0.label}}</button>
        <button class="tab" type="button" data-tab="cases" aria-selected="false">{{tabs.1.label}}</button>
        <button class="tab" type="button" data-tab="reviews" aria-selected="false">{{tabs.2.label}}</button>
      </div>

      <div class="tab-panel active" id="services" aria-hidden="false">
        <div class="grid3">
          {{#tabs.0.cards}}
          <article class="tile">
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

      <div class="tab-panel" id="cases" aria-hidden="true">
        <div class="grid3">
          {{#tabs.1.cards}}
          <article class="tile">
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

      <div class="tab-panel" id="reviews" aria-hidden="true">
        <div class="grid3">
          {{#tabs.2.cards}}
          <article class="tile">
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

  <section id="pricing" class="reveal">
    <div class="container">
      <h2>Тарифы</h2>
      <div class="pricing">
        {{#pricing}}
        <article class="price-card {{#featured}}featured{{/featured}}">
          <h3>{{name}}</h3>
          <div class="price">{{price}}</div>
          <ul class="list">
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
      <h2>Контакты</h2>
      <div class="contact">
        <div class="contact-card">
          <div class="k">Телефон</div><div class="v">{{contact.phone}}</div>
          <div class="k">Email</div><div class="v">{{contact.email}}</div>
          <div class="k">Адрес</div><div class="v">{{contact.address}}</div>
          <div class="k">Часы</div><div class="v">{{contact.hours}}</div>
        </div>

        <form id="contact-form" class="form">
          <label>Имя <input id="name" name="name" required></label>
          <label>Email <input id="email" name="email" type="email" required></label>
          <label>Тема
            <select id="topic" name="topic" required>
              <option value="consult">Консультация</option>
              <option value="order">Запрос</option>
              <option value="pricing">Тарифы</option>
            </select>
          </label>
          <label>Сообщение <textarea id="message" name="message" required></textarea></label>
          <label class="consent"><input name="consent" type="checkbox" required> Согласен на обработку данных</label>
          <button class="btn primary" type="submit">Отправить</button>
          <div id="form-status" aria-live="polite"></div>
        </form>
      </div>
    </div>
  </section>
</main>

<footer id="site-footer">
  <div class="container footer">
    <div>© {{year}} {{brand}}</div>
    <a href="#hero">Наверх</a>
  </div>
</footer>

<button id="to-top" type="button" aria-label="Наверх">↑</button>
<div id="toast" role="status" aria-live="polite"></div>
<script defer src="/app.js"></script>
</body>
</html>
