:root{
  --bg:#f7f7f2;
  --text:#0b0c10;
  --muted:rgba(11,12,16,.70);
  --line:#0b0c10;
  --accent:#ff2d55;
  --accent2:#00d084;
  --card:#ffffff;
  --shadow:6px 6px 0 #0b0c10;
  --shadow2:10px 10px 0 rgba(11,12,16,.18);
  --r:14px;
  --max:1120px;
  --t:.18s ease;
}
[data-theme="dark"]{
  --bg:#0b0c10;
  --text:#f7f7f2;
  --muted:rgba(247,247,242,.72);
  --line:#f7f7f2;
  --card:#12131a;
  --shadow:6px 6px 0 rgba(247,247,242,.9);
  --shadow2:10px 10px 0 rgba(247,247,242,.18);
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--text)}
a{color:inherit;text-decoration:none}
.container{max-width:var(--max);margin:0 auto;padding:0 16px}
.muted{color:var(--muted)}
.no-scroll{overflow:hidden}

#site-header{
  position:sticky;top:0;z-index:10;
  background:var(--bg);
  border-bottom:3px solid var(--line);
}
#site-header.scrolled{box-shadow:0 10px 0 rgba(0,0,0,.06)}
#primary-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}
.brand{display:flex;align-items:center;gap:12px}
.stamp{display:grid;place-items:center;width:34px;height:34px;border:3px solid var(--line);box-shadow:var(--shadow);background:var(--card)}
.brand-name{font-weight:900;letter-spacing:-.02em}
.brand-tagline{font-size:12px;color:var(--muted)}
.right{display:flex;gap:10px;align-items:center}

#nav-toggle,#theme-toggle{
  border:3px solid var(--line);
  background:var(--card);
  padding:10px 12px;border-radius:var(--r);
  box-shadow:var(--shadow);
  cursor:pointer;
  transition:transform var(--t);
}
#nav-toggle:hover,#theme-toggle:hover{transform:translate(-2px,-2px)}

.nav-menu{list-style:none;display:flex;gap:10px;margin:0;padding:0}
.nav-menu a{
  border:3px solid transparent;
  padding:10px 12px;border-radius:var(--r);
  transition:transform var(--t),background var(--t),border var(--t);
}
.nav-menu a:hover{
  background:var(--card);
  border-color:var(--line);
  transform:translate(-2px,-2px);
  box-shadow:var(--shadow2);
}

main section{padding:clamp(32px,5vw,72px) 0}
h1{margin:0 0 10px;font-size:clamp(30px,4.2vw,54px);line-height:1.0}
h2{margin:0 0 12px;font-size:clamp(20px,2.6vw,30px)}
h3{margin:0 0 8px}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  padding:12px 16px;border-radius:var(--r);
  border:3px solid var(--line);
  background:var(--card);
  box-shadow:var(--shadow);
  cursor:pointer;
  transition:transform var(--t), background var(--t);
}
.btn:hover{transform:translate(-2px,-2px)}
.btn:active{transform:translate(0,0)}
.btn.primary{background:var(--accent);color:#fff}
.btn.small{padding:10px 12px;font-size:14px}
.wide{width:100%}

.poster{
  display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:stretch;
}
.headline,.spec{
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:18px;
}
.tag{
  display:inline-block;
  padding:6px 10px;
  border:3px solid var(--line);
  border-radius:999px;
  background:linear-gradient(90deg, rgba(255,45,85,.18), rgba(0,208,132,.18));
  font-weight:800;
  margin-bottom:10px;
}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0 8px}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{border:3px dashed var(--line);padding:6px 10px;border-radius:999px;font-weight:700}

.spec-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:2px dashed rgba(0,0,0,.18)}
[data-theme="dark"] .spec-row{border-bottom-color:rgba(255,255,255,.18)}

.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.panel{
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
  position:relative;
  overflow:hidden;
  transition:transform var(--t);
}
.panel:hover{transform:translate(-2px,-2px)}
.panel-top{display:flex;align-items:center;gap:10px}
.ico{width:34px;height:34px;border:3px solid var(--line);border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg, rgba(255,45,85,.25), rgba(0,208,132,.20))}
.dash{height:6px;background:repeating-linear-gradient(90deg,var(--line) 0 10px, transparent 10px 16px);margin-top:12px}

.showcase-head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:10px}
.tab-buttons{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px}
.tab{
  border:3px solid var(--line);
  background:var(--card);
  padding:10px 12px;border-radius:var(--r);
  box-shadow:var(--shadow);
  cursor:pointer;
  transition:transform var(--t);
}
.tab:hover{transform:translate(-2px,-2px)}
.tab.active{background:linear-gradient(90deg, rgba(255,45,85,.20), rgba(0,208,132,.18))}
.tab-panel{display:none}
.tab-panel.active{display:block}

.list{display:grid;gap:12px}
.rowline{
  display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:14px;
}
.meta{font-weight:900;color:var(--muted)}

.quotes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.quote{
  margin:0;
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
}
.quote footer{margin-top:10px;font-weight:900}

.packs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.pack{
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
  transition:transform var(--t);
}
.pack:hover{transform:translate(-2px,-2px)}
.pack.featured{outline:5px solid var(--accent2)}
.price{font-size:22px;font-weight:900;margin:8px 0}
.pack ul{margin:0;padding-left:18px}

.accordion{display:grid;gap:12px}
.accordion-item{
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  overflow:hidden;
}
.accordion-trigger{
  width:100%;text-align:left;
  padding:14px 16px;
  border:0;background:transparent;
  cursor:pointer;font-weight:900;
}
.accordion-content{padding:0 16px 14px}

.contact-split{display:grid;grid-template-columns:.9fr 1.1fr;gap:16px}
.board,.form{
  background:var(--card);
  border:3px solid var(--line);
  border-radius:var(--r);
  box-shadow:var(--shadow);
  padding:16px;
}
.kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:2px dashed rgba(0,0,0,.18)}
[data-theme="dark"] .kv{border-bottom-color:rgba(255,255,255,.18)}
.form{display:grid;gap:12px}
.form label{display:grid;gap:6px;font-weight:900}
.form input,.form select,.form textarea{
  padding:10px 12px;border-radius:var(--r);
  border:3px solid var(--line);
  background:transparent;color:var(--text);
}
.form textarea{min-height:120px;resize:vertical}
.consent{display:flex;align-items:center;gap:10px}
#form-status{font-weight:900;color:var(--muted)}

#site-footer{padding:18px 0;border-top:3px solid var(--line)}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px}

#toast{
  position:fixed;left:16px;bottom:16px;
  max-width:min(420px,calc(100vw - 32px));
  padding:12px 14px;border-radius:var(--r);
  border:3px solid var(--line);
  background:var(--card);
  box-shadow:var(--shadow);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .22s ease, transform .22s ease;
}
#toast.show{opacity:1;transform:translateY(0)}
#to-top{
  position:fixed;right:16px;bottom:16px;
  padding:10px 14px;border-radius:999px;
  border:3px solid var(--line);
  background:var(--card);
  box-shadow:var(--shadow);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .22s ease, transform .22s ease;
}
#to-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}

.reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:translateY(0)}

@media (max-width:980px){
  .poster,.contact-split{grid-template-columns:1fr}
  .grid,.packs,.quotes{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rowline{grid-template-columns:1fr}
}
@media (max-width:768px){
  .nav-menu{display:none}
  .nav-menu.nav-open{
    position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    background:rgba(0,0,0,.72);gap:10px;z-index:1001
  }
}
@media (prefers-reduced-motion: reduce){
  *{transition:none !important;animation:none !important}
}
