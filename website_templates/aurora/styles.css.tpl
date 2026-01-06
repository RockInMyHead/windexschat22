:root{
  --bg:#070b16;
  --text:#eaf1ff;
  --muted:rgba(234,241,255,.72);
  --line:rgba(234,241,255,.14);
  --p1:#4f8cff;
  --p2:#8a5cff;
  --a:#35d07f;
  --r:18px;
  --max:1120px;
  --sh:0 16px 48px rgba(0,0,0,.42);
  --t:.22s ease;
}
*{box-sizing:border-box}
body{
  margin:0;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  color:var(--text);
  background:
    radial-gradient(1200px 650px at 10% -10%, rgba(79,140,255,.40), transparent 60%),
    radial-gradient(900px 520px at 100% 0%, rgba(138,92,255,.32), transparent 58%),
    radial-gradient(900px 520px at 20% 110%, rgba(53,208,127,.16), transparent 58%),
    var(--bg);
}
a{color:inherit;text-decoration:none}
.container{max-width:var(--max);margin:0 auto;padding:0 16px}
.muted{color:var(--muted)}
.no-scroll{overflow:hidden}

#site-header{
  position:sticky;top:0;z-index:10;
  background:rgba(7,11,22,.58);
  backdrop-filter:blur(14px);
  border-bottom:1px solid rgba(255,255,255,.06);
}
#site-header.scrolled{background:rgba(7,11,22,.82);border-bottom-color:rgba(255,255,255,.10)}
#primary-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}

.brand{display:flex;align-items:center;gap:12px}
.brand-dot{
  width:12px;height:12px;border-radius:6px;
  background:linear-gradient(135deg,var(--p1),var(--p2));
  box-shadow:0 0 0 8px rgba(79,140,255,.14);
}
.brand-name{font-weight:900;letter-spacing:-.02em}
.brand-tagline{font-size:12px;color:var(--muted)}

#nav-toggle,#theme-toggle{
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);
  color:var(--text);
  padding:10px 12px;border-radius:14px;cursor:pointer;
  transition:transform var(--t),background var(--t);
}
#nav-toggle:hover,#theme-toggle:hover{background:rgba(255,255,255,.10);transform:translateY(-1px)}
.nav-menu{list-style:none;display:flex;gap:10px;margin:0;padding:0}
.nav-menu a{padding:10px 12px;border-radius:14px;color:var(--muted);transition:background var(--t),color var(--t),transform var(--t)}
.nav-menu a:hover{background:rgba(255,255,255,.08);color:var(--text);transform:translateY(-1px)}

main section{padding:clamp(36px,5vw,74px) 0}
h1{margin:0 0 10px;font-size:clamp(30px,4vw,46px);line-height:1.03;letter-spacing:-.02em}
h2{margin:0 0 14px;font-size:clamp(20px,2.4vw,28px);letter-spacing:-.01em}

.hero-wrap{
  position:relative;
  display:grid;grid-template-columns:1.15fr .85fr;
  gap:16px;align-items:stretch;
}
.hero-copy,.hero-art{
  border-radius:var(--r);
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:var(--sh);
  padding:clamp(18px,3vw,28px);
}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0 6px}
.badges{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.badge{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:13px}

.hero-art{overflow:hidden}
.hero-art svg{width:100%;height:auto;display:block;opacity:.9}
.orb{position:absolute;filter:blur(18px);opacity:.6;mix-blend-mode:screen;animation:float 6.5s ease-in-out infinite}
.o1{width:220px;height:220px;border-radius:50%;background:rgba(79,140,255,.45);left:52%;top:-30px}
.o2{width:180px;height:180px;border-radius:50%;background:rgba(138,92,255,.42);left:70%;top:90px;animation-duration:7.5s}
.o3{width:160px;height:160px;border-radius:50%;background:rgba(53,208,127,.30);left:44%;top:140px;animation-duration:8.2s}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(14px)}}

.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:10px}

.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card,.tile,.price-card,.contact-card,.form,.accordion-item{
  border-radius:var(--r);
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:var(--sh);
}
.card{padding:16px;transition:transform var(--t),background var(--t)}
.card:hover{transform:translateY(-3px);background:rgba(255,255,255,.08)}
.icon{font-size:22px}
.tile{padding:16px}
.tile h4{margin:0 0 8px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.meta{color:var(--muted);font-size:13px}

.tab-buttons{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px}
.tab{padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:var(--text);cursor:pointer}
.tab.active{background:linear-gradient(135deg,rgba(79,140,255,.55),rgba(138,92,255,.45));border-color:rgba(255,255,255,.18)}
.tab-panel{display:none}
.tab-panel.active{display:block}

.pricing{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.price-card{padding:18px;position:relative;overflow:hidden}
.price-card.featured{border-color:rgba(79,140,255,.40);background:linear-gradient(180deg,rgba(79,140,255,.16),rgba(255,255,255,.06));transform:translateY(-4px)}
.price{font-size:22px;font-weight:900;margin:8px 0}
.list{margin:0;padding-left:18px;color:var(--muted)}

.accordion{display:grid;gap:12px}
.accordion-trigger{
  width:100%;padding:14px 16px;border:0;background:transparent;color:var(--text);
  cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center
}
.accordion-content{padding:0 16px 14px}

.contact{display:grid;grid-template-columns:.9fr 1.1fr;gap:16px}
.contact-card{padding:16px;display:grid;gap:10px}
.kv{display:flex;justify-content:space-between;gap:10px;color:rgba(234,241,255,.85)}
.form{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form label{display:grid;gap:6px;font-weight:700;color:rgba(234,241,255,.85)}
.form input,.form select,.form textarea{
  width:100%;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);
  background:rgba(7,11,22,.55);color:var(--text)
}
.form textarea{min-height:120px;resize:vertical}
.consent{grid-column:1/-1;display:flex;align-items:center;gap:10px;font-weight:600}
#form-status{grid-column:1/-1;color:rgba(234,241,255,.85)}

#site-footer{padding:20px 0;border-top:1px solid rgba(255,255,255,.06);color:rgba(234,241,255,.75)}
.footer{display:flex;justify-content:space-between;align-items:center;gap:12px}

#toast{
  position:fixed;left:16px;bottom:16px;
  max-width:min(420px,calc(100vw - 32px));
  padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.14);
  background:rgba(7,11,22,.86);box-shadow:var(--sh);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity var(--t),transform var(--t)
}
#toast.show{opacity:1;transform:translateY(0)}
#to-top{
  position:fixed;right:16px;bottom:16px;border-radius:999px;padding:10px 14px;
  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:var(--text);
  opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity var(--t),transform var(--t),background var(--t)
}
#to-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}
#to-top:hover{background:rgba(255,255,255,.10)}

.reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:translateY(0)}

@media (max-width:980px){
  .hero-wrap{grid-template-columns:1fr}
  .grid3,.pricing{grid-template-columns:repeat(2,minmax(0,1fr))}
  .contact{grid-template-columns:1fr}
  .form{grid-template-columns:1fr}
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