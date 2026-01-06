:root{
  --bg:#fcfbf7;
  --text:#121418;
  --muted:rgba(18,20,24,.72);
  --line:rgba(18,20,24,.14);
  --p:#0a84ff;
  --p2:#ff375f;
  --a:#38a169;
  --r:18px;
  --max:1120px;
  --t:.22s ease;
  --shadow:0 18px 60px rgba(18,20,24,.10);
}
[data-theme="dark"]{
  --bg:#0f1116;
  --text:#f4f6fb;
  --muted:rgba(244,246,251,.72);
  --line:rgba(244,246,251,.14);
  --p:#0a84ff;
  --p2:#ff375f;
  --a:#38a169;
  --shadow:0 18px 60px rgba(0,0,0,.42);
}
*{box-sizing:border-box}
body{
  margin:0;
  font-family: ui-serif, Georgia, "Times New Roman", serif;
  background:var(--bg);
  color:var(--text);
}
a{color:inherit;text-decoration:none}
.container{max-width:var(--max);margin:0 auto;padding:0 16px}
.muted{color:var(--muted)}
.no-scroll{overflow:hidden}

#site-header{
  position:sticky;top:0;z-index:10;
  background:color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(10px);
  border-bottom:1px solid var(--line);
}
#site-header.scrolled{background:color-mix(in srgb, var(--bg) 94%, transparent)}
#primary-nav{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 0;
}
.brand .sig{font-weight:900;letter-spacing:-.02em;font-size:18px;font-family:ui-serif, Georgia, serif}
.brand .sub{font-size:12px;color:var(--muted);font-style:italic}

#nav-toggle,#theme-toggle{
  border:1px solid var(--line);
  background:var(--bg);
  padding:10px 12px;border-radius:14px;
  cursor:pointer;
  transition:transform var(--t), box-shadow var(--t);
  box-shadow:0 10px 26px rgba(0,0,0,.08);
}
#nav-toggle:hover,#theme-toggle:hover{transform:translateY(-1px)}

.nav-menu{list-style:none;display:flex;gap:10px;margin:0;padding:0}
.nav-menu a{
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  padding:10px 12px;border-radius:14px;color:var(--muted);
  transition:background var(--t), color var(--t), transform var(--t);
}
.nav-menu a:hover{background:color-mix(in srgb, var(--p) 10%, transparent);color:var(--text);transform:translateY(-1px)}

main section{padding:clamp(36px,5vw,74px) 0}
h1{
  margin:0 0 12px;
  font-size:clamp(32px,4vw,56px);
  line-height:1.02;
  letter-spacing:-.02em;
}
h2{
  margin:0 0 12px;
  font-size:clamp(22px,2.6vw,32px);
  letter-spacing:-.01em;
}
h3,h4{margin:0 0 8px}
.lede{
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  font-size:16px;line-height:1.6;color:var(--muted);
}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  padding:12px 16px;border-radius:16px;
  border:1px solid var(--line);
  background:var(--bg);
  cursor:pointer;
  transition:transform var(--t), box-shadow var(--t), background var(--t);
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.btn:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.btn.primary{
  background:linear-gradient(135deg, color-mix(in srgb, var(--p) 90%, #fff 10%), color-mix(in srgb, var(--p2) 80%, #fff 20%));
  color:#fff;border-color:transparent;
}
.btn.ghost{background:transparent}
.btn.small{padding:10px 12px;border-radius:14px;font-size:14px}

.mag{
  display:grid;grid-template-columns:1.2fr .8fr;gap:16px;align-items:stretch;
}
.lead,.side{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:18px;
}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0 8px}
.badges{display:flex;gap:10px;flex-wrap:wrap}
.badge{
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  padding:8px 10px;border-radius:999px;
  border:1px solid var(--line);
  background:color-mix(in srgb, var(--p) 7%, transparent);
}

.side{display:grid;gap:12px}
.side-card{
  border:1px solid var(--line);
  border-radius:var(--r);
  padding:14px;
  background:color-mix(in srgb, var(--bg) 86%, transparent);
}
.side-card .k{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--muted);font-size:12px}
.side-card .v{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:800;margin:0 0 10px}
.pattern{
  border-radius:var(--r);
  overflow:hidden;
  border:1px solid var(--line);
}
.pattern svg{width:100%;height:auto;display:block}

.rail{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;
}
.note{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
}
.cap{display:flex;align-items:center;gap:10px}
.ico{
  width:34px;height:34px;border-radius:12px;
  background:color-mix(in srgb, var(--p) 12%, transparent);
  display:grid;place-items:center;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.note p{margin:0;color:var(--muted);line-height:1.6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}

.section-head{display:flex;justify-content:space-between;align-items:end;gap:16px}

.tab-buttons{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px}
.tab{
  border:1px solid var(--line);
  background:var(--bg);
  padding:10px 12px;border-radius:14px;
  cursor:pointer;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  transition:transform var(--t), box-shadow var(--t);
}
.tab:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.tab.active{background:color-mix(in srgb, var(--p) 10%, var(--bg) 90%)}
.tab-panel{display:none}
.tab-panel.active{display:block}

.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.story{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
}
.story header{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.meta{color:var(--muted);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px}
.story p{color:var(--muted);line-height:1.6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}

.timeline{display:grid;gap:14px}
.t-item{display:grid;grid-template-columns:18px 1fr;gap:12px}
.dot{width:12px;height:12px;border-radius:999px;background:linear-gradient(135deg,var(--p),var(--p2));margin-top:6px}
.t-body{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:14px;
}
.t-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.columns{column-count:3;column-gap:16px}
.pull{
  break-inside:avoid;
  margin:0 0 16px;
  padding:14px;
  border-radius:var(--r);
  border:1px solid var(--line);
  background:var(--bg);
  box-shadow:var(--shadow);
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.pull footer{margin-top:10px;font-weight:800}

.pricing{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tariff{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
}
.tariff.featured{outline:2px solid color-mix(in srgb, var(--p) 40%, transparent)}
.tariff .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.price{font-weight:900;font-size:22px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text)}
.tariff ul{margin:10px 0 0;padding-left:18px;color:var(--muted);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}

.accordion{display:grid;gap:12px}
.accordion-item{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  overflow:hidden;
}
.accordion-trigger{
  width:100%;text-align:left;
  padding:14px 16px;border:0;background:transparent;
  cursor:pointer;font-weight:900;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.accordion-content{padding:0 16px 14px}

.contact{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}
.form{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
  display:grid;gap:12px;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.form .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form label{display:grid;gap:6px;font-weight:800}
.form input,.form select,.form textarea{
  padding:10px 12px;border-radius:14px;border:1px solid var(--line);
  background:color-mix(in srgb, var(--bg) 86%, transparent);color:var(--text)
}
.form textarea{min-height:120px;resize:vertical}
.consent{display:flex;align-items:center;gap:10px}
#form-status{color:var(--muted);font-weight:800}

.info{
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
  display:grid;gap:10px;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.line{display:flex;justify-content:space-between;gap:10px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 0;border-top:1px solid var(--line)}
#toast{
  position:fixed;left:16px;bottom:16px;
  max-width:min(420px,calc(100vw - 32px));
  padding:12px 14px;border-radius:16px;border:1px solid var(--line);
  background:var(--bg);box-shadow:var(--shadow);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity var(--t),transform var(--t)
}
#toast.show{opacity:1;transform:translateY(0)}
#to-top{
  position:fixed;right:16px;bottom:16px;
  padding:10px 14px;border-radius:999px;border:1px solid var(--line);
  background:var(--bg);box-shadow:var(--shadow);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity var(--t),transform var(--t)
}
#to-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}

.reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:translateY(0)}

@media (max-width:980px){
  .mag,.contact{grid-template-columns:1fr}
  .rail,.cards,.pricing{grid-template-columns:repeat(2,minmax(0,1fr))}
  .columns{column-count:2}
  .form .grid{grid-template-columns:1fr}
}
@media (max-width:768px){
  .nav-menu{display:none}
  .nav-menu.nav-open{
    position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    background:rgba(0,0,0,.62);gap:10px;z-index:1001
  }
}
@media (prefers-reduced-motion: reduce){
  *{transition:none !important;animation:none !important}
}