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
      <span class="stamp" aria-hidden="true">★</span>
      <div>
        <div class="brand-name">{{brand}}</div>
        <div class="brand-tagline">{{tagline}}</div>
      </div>
    </div>

    <div class="right">
      <button id="theme-toggle" type="button">Тема</button>
      <button id="nav-toggle" type="button" aria-expanded="false">Меню</button>
    </div>

    <ul class="nav-menu">
      <li><a href="#hero">Старт</a></li>
      <li><a href="#features">Сильные стороны</a></li>
      <li><a href="#showcase">Что делаем</a></li>
      <li><a href="#pricing">Пакеты</a></li>
      <li><a href="#contact">Запись</a></li>
    </ul>
  </nav>
</header>

<main id="main">
  <section id="hero" class="container reveal">
    <div class="poster">
      <div class="headline">
        <div class="tag">Сервис • Скорость • Контроль</div>
        <h1>{{hero.title}}</h1>
        <p>{{hero.subtitle}}</p>
        <div class="cta">
          <a class="btn primary" href="#contact">{{hero.primaryCta}}</a>
          <a class="btn" href="#pricing">{{hero.secondaryCta}}</a>
        </div>

        <div class="chips">
          {{#hero.badges}}<span class="chip">{{.}}</span>{{/hero.badges}}
        </div>
      </div>

      <div class="spec">
        <div class="spec-row"><span>Фокус</span><b>Качество и прозрачность</b></div>
        <div class="spec-row"><span>Формат</span><b>Диагностика → решение</b></div>
        <div class="spec-row"><span>Срок</span><b>По SLA</b></div>
        <div class="spec-row"><span>Гарантия</span><b>Документально</b></div>
        <button class="btn primary wide" type="button" data-order="Экспресс-диагностика">Экспресс-заявка</button>
      </div>
    </div>
  </section>

  <section id="features" class="reveal">
    <div class="container">
      <h2>Сильные стороны</h2>
      <div class="grid">
        {{#features}}
        <article class="panel">
          <div class="panel-top">
            <div class="ico" aria-hidden="true">{{icon}}</div>
            <h3>{{title}}</h3>
          </div>
          <p>{{text}}</p>
          <div class="dash"></div>
        </article>
        {{/features}}
      </div>
    </div>
  </section>

  <section id="showcase" class="reveal">
    <div class="container">
      <div class="showcase-head">
        <h2>Подача</h2>
        <p>Три режима. Нажмите — блоки переключаются.</p>
      </div>

      <div class="tab-buttons">
        <button class="tab active" type="button" data-tab="services" aria-selected="true">{{tabs.0.label}}</button>
        <button class="tab" type="button" data-tab="cases" aria-selected="false">{{tabs.1.label}}</button>
        <button class="tab" type="button" data-tab="reviews" aria-selected="false">{{tabs.2.label}}</button>
      </div>

      <div class="tab-panel active" id="services" aria-hidden="false">
        <div class="list">
          {{#tabs.0.cards}}
          <div class="rowline">
            <div>
              <b>{{title}}</b>
              <div class="muted">{{text}}</div>
            </div>
            <div class="meta">{{meta}}</div>
            <a class="btn small" href="#contact" data-order="{{title}}">Запрос</a>
          </div>
          {{/tabs.0.cards}}
        </div>
      </div>

      <div class="tab-panel" id="cases" aria-hidden="true">
        <div class="list">
          {{#tabs.1.cards}}
          <div class="rowline">
            <div>
              <b>{{title}}</b>
              <div class="muted">{{text}}</div>
            </div>
            <div class="meta">{{meta}}</div>
            <a class="btn small" href="#contact" data-order="{{title}}">Уточнить</a>
          </div>
          {{/tabs.1.cards}}
        </div>
      </div>

      <div class="tab-panel" id="reviews" aria-hidden="true">
        <div class="quotes">
          {{#tabs.2.cards}}
          <blockquote class="quote">
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
      <h2>Пакеты</h2>
      <div class="packs">
        {{#pricing}}
        <article class="pack {{#featured}}featured{{/featured}}">
          <h3>{{name}}</h3>
          <div class="price">{{price}}</div>
          <ul>
            {{#bullets}}<li>{{.}}</li>{{/bullets}}
          </ul>
          <button class="btn primary wide" type="button" data-order="{{name}}">Выбрать</button>
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
      <div class="contact-split">
        <div class="board">
          <h2>Запись</h2>
          <p class="muted">Контакты и быстрая форма. Кнопки везде ведут сюда.</p>
          <div class="kv"><span>Телефон</span><b>{{contact.phone}}</b></div>
          <div class="kv"><span>Email</span><b>{{contact.email}}</b></div>
          <div class="kv"><span>Адрес</span><b>{{contact.address}}</b></div>
          <div class="kv"><span>Часы</span><b>{{contact.hours}}</b></div>
        </div>

        <form id="contact-form" class="form">
          <label>Имя <input id="name" name="name" required></label>
          <label>Email <input id="email" name="email" type="email" required></label>
          <label>Тема
            <select id="topic" name="topic" required>
              <option value="consult">Консультация</option>
              <option value="order">Запрос</option>
              <option value="pricing">Пакеты</option>
            </select>
          </label>
          <label>Сообщение <textarea id="message" name="message" required></textarea></label>
          <label class="consent"><input name="consent" type="checkbox" required> Согласен на обработку данных</label>
          <button class="btn primary wide" type="submit">Отправить</button>
          <div id="form-status" aria-live="polite"></div>
        </form>
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
