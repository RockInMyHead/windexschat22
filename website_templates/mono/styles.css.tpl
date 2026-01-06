:root{
  --bg:#0a0a0a;
  --panel:#1a1a1a;
  --panel2:#2a2a2a;
  --text:#f5f5f5;
  --muted:#a0a0a0;
  --border:#333;
  --p1:#00d4ff;
  --p2:#0099cc;
  --a:#ff6b00;
  --r:0px;
  --max:1200px;
  --sh:0 4px 20px rgba(0,0,0,.6);
  --t:.15s ease;
  --grid:1px solid #333;
}

*{box-sizing:border-box}
body{
  margin:0;
  font-family:'Courier New',monospace;
  color:var(--text);
  background:
    linear-gradient(45deg, #0a0a0a 25%, transparent 25%),
    linear-gradient(-45deg, #0a0a0a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #0a0a0a 75%),
    linear-gradient(-45deg, transparent 75%, #0a0a0a 75%);
  background-size:20px 20px;
  background-position:0 0, 0 10px, 10px -10px, -10px 0px;
  background-color:var(--bg);
}
a{color:inherit;text-decoration:none}
.container{max-width:var(--max);margin:0 auto;padding:0 20px}
.muted{color:var(--muted)}

#site-header{
  position:sticky;top:0;z-index:10;
  background:var(--panel);
  border-bottom:var(--grid);
}
#primary-nav{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 0}

.brand{display:flex;align-items:center;gap:15px}
.mark{
  width:16px;height:16px;border:var(--grid);
  background:repeating-linear-gradient(45deg,var(--p1),var(--p1) 2px,var(--panel) 2px,var(--panel) 4px);
}
.brand-name{font-weight:900;letter-spacing:-.01em;font-family:monospace;text-transform:uppercase}
.brand-tagline{font-size:11px;color:var(--muted);font-family:monospace}

#nav-toggle,#theme-toggle{
  border:var(--grid);
  background:var(--panel);
  color:var(--text);
  padding:12px 16px;cursor:pointer;
  font-family:monospace;text-transform:uppercase;font-size:12px;
  transition:background var(--t);
}
#nav-toggle:hover,#theme-toggle:hover{background:var(--panel2)}

.nav-menu{list-style:none;display:flex;gap:15px;margin:0;padding:0}
.nav-menu a{padding:12px 16px;border:var(--grid);color:var(--muted);font-family:monospace;text-transform:uppercase;font-size:12px;transition:background var(--t)}
.nav-menu a:hover{background:var(--panel2);color:var(--text)}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  padding:14px 18px;border:var(--grid);
  background:var(--panel);
  color:var(--text);cursor:pointer;font-family:monospace;text-transform:uppercase;font-size:12px;
  transition:background var(--t),transform var(--t);
}
.btn:hover{transform:translateY(-1px);background:var(--panel2)}
.btn.primary{background:linear-gradient(135deg,var(--p1),var(--p2));border-color:var(--p1)}
.btn.ghost{background:transparent;border-color:var(--border)}
.btn.small{padding:10px 14px;font-size:11px}

main section{padding:clamp(40px,6vw,80px) 0}
h1{margin:0 0 12px;font-size:clamp(32px,4vw,48px);line-height:1.1;letter-spacing:-.02em;font-family:monospace;text-transform:uppercase}
h2{margin:0 0 16px;font-size:clamp(24px,3vw,32px);letter-spacing:-.01em;font-family:monospace;text-transform:uppercase}

.hero-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:stretch;
  border:var(--grid);background:var(--panel);
}
.hero-copy,.hero-art{
  padding:clamp(20px,4vw,32px);
  border-right:var(--grid);
}
.hero-art{border-right:none}
.hero-cta{display:flex;gap:15px;flex-wrap:wrap;margin:16px 0 8px}
.hero-badges{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}
.badge{padding:10px 12px;border:var(--grid);background:var(--panel2);font-size:11px;font-family:monospace;text-transform:uppercase}

.features-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.card{
  border:var(--grid);background:var(--panel);padding:20px;
  transition:background var(--t),transform var(--t);
}
.card:hover{transform:translateY(-2px);background:var(--panel2)}
.icon{font-size:24px;color:var(--p1)}

.tab-buttons{display:flex;gap:15px;flex-wrap:wrap;margin-bottom:15px}
.tab{
  padding:12px 16px;border:var(--grid);background:var(--panel);color:var(--text);cursor:pointer;
  font-family:monospace;text-transform:uppercase;font-size:12px;
}
.tab.active{background:linear-gradient(135deg,var(--p1),var(--p2));border-color:var(--p1)}
.tab-panel{display:none;border:var(--grid);background:var(--panel);padding:20px;margin-top:10px}
.tab-panel.active{display:block}

.product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.product-card{
  border:var(--grid);background:var(--panel);padding:18px;
}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;border-top:var(--grid);padding-top:10px}
.meta{color:var(--muted);font-size:11px;font-family:monospace;text-transform:uppercase}

.pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.pricing-card{
  border:var(--grid);background:var(--panel);padding:20px;
}
.pricing-card.featured{
  border-color:var(--p1);
  background:linear-gradient(135deg,rgba(0,212,255,.1),rgba(0,153,204,.05));
}
.price{font-size:24px;font-weight:900;margin:10px 0;font-family:monospace}
.bullets{margin:0;padding-left:20px;color:var(--muted);font-family:monospace}
.bullets li{margin-bottom:8px}

.accordion{display:grid;gap:15px}
.accordion-item{border:var(--grid);background:var(--panel);overflow:hidden}
.accordion-trigger{width:100%;padding:16px 20px;background:transparent;border:0;color:var(--text);cursor:pointer;text-align:left;font-family:monospace;text-transform:uppercase;font-size:12px;display:flex;justify-content:space-between}
.accordion-trigger:hover{background:var(--panel2)}
.accordion-content{padding:0 20px 16px;border-top:var(--grid);margin-top:10px}

.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.contact-card,.form{
  border:var(--grid);background:var(--panel);padding:20px;
}
.form label{display:grid;gap:8px;color:var(--muted);font-weight:600;font-family:monospace;text-transform:uppercase;font-size:11px}
.form input,.form select,.form textarea{
  width:100%;padding:12px 16px;border:var(--grid);background:var(--panel2);color:var(--text);font-family:monospace;
}
.form textarea{min-height:140px;resize:vertical}
.consent{grid-column:1/-1;display:flex;align-items:center;gap:12px;font-weight:500;font-family:monospace;text-transform:uppercase;font-size:11px}
#form-status{margin-top:12px;color:var(--muted);font-family:monospace;text-transform:uppercase;font-size:11px}
.footer-row{display:flex;justify-content:space-between;align-items:center;padding:20px 0;color:var(--muted);border-top:var(--grid);font-family:monospace;text-transform:uppercase;font-size:11px}

#toast{
  position:fixed;left:20px;bottom:20px;max-width:min(480px,calc(100vw - 40px));
  padding:16px 20px;border:var(--grid);background:var(--panel2);
  opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity var(--t),transform var(--t);
}
#toast.show{opacity:1;transform:translateY(0)}
#to-top{
  position:fixed;right:20px;bottom:20px;border:var(--grid);background:var(--panel);color:var(--text);
  padding:12px 16px;opacity:0;transform:translateY(12px);pointer-events:none;
  transition:opacity var(--t),transform var(--t),background var(--t);
  font-family:monospace;text-transform:uppercase;font-size:12px;
}
#to-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}
#to-top:hover{background:var(--panel2)}

@media (max-width:980px){
  .hero-grid{grid-template-columns:1fr}
  .hero-copy{border-right:none;border-bottom:var(--grid)}
  .features-grid,.product-grid,.pricing-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .contact-grid{grid-template-columns:1fr}
}
@media (max-width:768px){
  .nav-menu{display:none}
  #nav-toggle{display:block}
  .nav-menu.nav-open{
    position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    background:rgba(0,0,0,.9);gap:15px;z-index:1001;border:var(--grid);
  }
}
