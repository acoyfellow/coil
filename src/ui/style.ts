export const FONTS =
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&family=Google+Sans+Code:wght@400;500&display=swap';

const LIGHT = `
  --bg:#ffffff;--side:#fafaf9;--raise:#f4f4f2;--hover:#efefec;--line:#ebebe8;--line2:#deded9;
  --text:#18181b;--dim:#6b6b70;--faint:#a1a1a6;
  --orange:#f38020;--orange-soft:#fdf0e4;--blue:#0051c3;--blue-soft:#eaf1fc;
  --ok:#1a7f4b;--warn:#b25e00;--bad:#c42b1c;
  --you:#eaf1fc;--you-line:#d3e2f8;--term-bg:#fbfbfa;--term-fg:#27272a;
`;

const DARK = `
  --bg:#141416;--side:#18181b;--raise:#1f1f23;--hover:#26262b;--line:#26262b;--line2:#34343a;
  --text:#ececee;--dim:#9b9ba3;--faint:#62626a;
  --orange:#f6913e;--orange-soft:#3a2614;--blue:#5b9cff;--blue-soft:#15233b;
  --ok:#4cc38a;--warn:#e5a83b;--bad:#ff6b5b;
  --you:#16243d;--you-line:#22385c;--term-bg:#101012;--term-fg:#e4e4e7;
`;

export const THEME = `:root{color-scheme:light dark;${LIGHT}
  --sans:"Google Sans Flex","Google Sans",ui-sans-serif,system-ui,sans-serif;
  --mono:"Google Sans Code",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;${DARK}}}`;

export const STYLE = `
:root{color-scheme:light dark;${LIGHT}
  --sans:"Google Sans Flex","Google Sans",ui-sans-serif,system-ui,sans-serif;
  --mono:"Google Sans Code",ui-monospace,SFMono-Regular,Menlo,monospace;
  --fg:var(--text);
}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;${DARK}}}
:root[data-theme=dark]{color-scheme:dark;${DARK}}
:root[data-theme=light]{color-scheme:light;${LIGHT}}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%;margin:0}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font:13.5px/1.55 var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;overflow:hidden}
button,input,textarea{font:inherit;color:inherit}
@media (max-width: 500px), (pointer: coarse){input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),select,textarea,[contenteditable]:not([contenteditable=false]){font-size:16px !important}}
button{cursor:pointer;border:1px solid transparent;background:transparent;border-radius:6px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;color:var(--dim);font-size:13px}
button:hover:not(:disabled){background:var(--hover);color:var(--text)}
button:disabled{opacity:.4;cursor:default}
button.primary{background:var(--text);color:var(--bg);font-weight:500}
button.primary:hover:not(:disabled){background:var(--text);color:var(--bg);opacity:.88}
input,textarea{width:100%;background:transparent;border:1px solid var(--line2);border-radius:8px;padding:6px 9px;outline:none}
input:focus,textarea:focus{border-color:var(--blue)}
textarea{resize:none}
.faint{color:var(--faint)}.dim{color:var(--dim)}

.app{display:grid;grid-template-columns:var(--side-w,248px) minmax(0,1fr) var(--panel-w,480px);grid-template-rows:100%;height:100dvh;box-sizing:border-box;padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)}
.side{border-right:1px solid var(--line);background:var(--side);display:flex;flex-direction:column;min-height:0}
.brand{display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 14px;height:42px;flex:none}
.brand .logo{display:inline-flex;align-items:center;height:28px;padding:0 2px;border-radius:6px}
.brand .logo img{display:block;height:16px;width:auto}
.brand .logo:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.offline .bar::after{content:'Offline. Showing the last view; actions resume when you reconnect.';position:fixed;top:calc(6px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:var(--orange-soft);color:var(--warn);border:1px solid var(--line2);border-radius:99px;padding:3px 12px;font-size:12px;z-index:40}
.brand .new{width:28px;height:28px;padding:0;justify-content:center;border-radius:50%;background:var(--text);color:var(--bg);font-size:16px}
.brand .new:hover:not(:disabled){background:var(--text);color:var(--bg);opacity:.85}
.list{flex:1;overflow:auto;padding:2px 6px}
button.group{border-radius:0;white-space:normal;font:inherit;font-size:11.5px;color:var(--faint);padding:10px 8px 3px;display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;text-align:left;cursor:pointer}
.group::before,.kids-toggle::before{content:"";width:0;height:0;border-left:4px solid currentColor;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transition:transform .12s;flex:none}
.group.open::before,.kids-toggle.open::before{transform:rotate(90deg)}
button.group:hover:not(:disabled){background:transparent;color:var(--dim)}
button.kids-toggle:hover:not(:disabled){background:transparent}
.group:focus-visible,.kids-toggle:focus-visible{outline:2px solid var(--orange);outline-offset:-2px;border-radius:5px}
button.kids-toggle{border-radius:4px;position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:1;width:16px;height:22px;padding:0;border:0;background:transparent;color:var(--faint);display:flex;align-items:center;justify-content:center;cursor:pointer}
.kids-toggle:hover{color:var(--text)}
.group::after{content:"";flex:1;border-top:1px solid var(--line)}
.item{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;color:inherit;text-decoration:none;min-width:0}
.item:hover{background:var(--hover)}
.item.on{background:var(--raise);font-weight:500}
.item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .m{font-size:11.5px;color:var(--faint);white-space:nowrap}
.item.child{padding-left:24px}
.dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--line2)}
.dot.awake{background:var(--ok)}.dot.paused{background:var(--warn)}.dot.busy{background:var(--blue);animation:pulse 1.2s infinite}.dot.failed{background:var(--bad)}
@keyframes pulse{50%{opacity:.3}}
.who{padding:6px 8px calc(6px + env(safe-area-inset-bottom)) 14px;border-top:1px solid var(--line);font-size:12px;color:var(--faint);display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.who .spend{font:11.5px var(--mono);color:var(--dim);padding:2px 6px;border-radius:6px;flex:none}
.who .spend:hover{background:var(--hover);color:var(--fg)}
.who .settings-open{width:28px;height:28px;padding:0;justify-content:center;border-radius:7px;color:var(--dim);flex:none}
.who .settings-open:hover:not(:disabled){color:var(--fg)}
.who .settings-open .icon{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}
.dialog.settings{width:min(720px,calc(100vw - 16px));max-height:min(620px,calc(100dvh - 16px));display:flex;flex-direction:column;overflow:hidden;padding:0}
.settings-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
.settings-head input{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:15px;outline:none;padding:4px 2px}
.settings-close{font:11.5px var(--mono);border:1px solid var(--line2);border-radius:6px;padding:2px 7px;color:var(--dim)}
.settings-body{display:grid;grid-template-columns:200px 1fr;min-height:0;flex:1}
.settings-nav{display:flex;flex-direction:column;gap:2px;padding:8px;border-right:1px solid var(--line);overflow:auto}
.settings-nav button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;white-space:normal;text-align:left;padding:7px 10px;border-radius:8px;color:var(--text);font-size:13.5px}
.settings-nav button small{color:var(--faint);font-size:11.5px}
.settings-nav button.on{background:var(--raise);font-weight:500}
.settings-pane{padding:16px 20px;overflow:auto;min-width:0}
.settings-pane h3{margin:0 0 12px;font-size:15px;font-weight:600}
.settings-fact{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.settings-fact span:first-child{color:var(--dim)}
.settings-fact span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);font-size:12.5px}
.settings-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
.settings-actions form{margin:0;display:flex}
.settings-button{display:inline-flex;align-items:center;font-size:13px;padding:6px 12px;border:1px solid var(--line2);border-radius:8px;color:var(--text);text-decoration:none;background:transparent}
.settings-button:hover{background:var(--hover)}
.settings-button.primary{background:var(--text);color:var(--bg);border-color:var(--text)}
.settings-button.danger{color:var(--bad)}
.settings-connector{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.settings-connector form{margin:0}
.settings-connector-name{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.settings-connector-name span{font-family:var(--mono);font-size:13px}
.settings-connector-name small{color:var(--faint);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.settings-state{font:11.5px var(--mono);color:var(--faint)}
.settings-state.on{color:var(--good,#16a34a)}
.settings-alert{color:var(--bad);font-size:13px;margin:0 0 10px}
.settings-note{color:var(--faint);font-size:12.5px;margin:10px 0 0}
@media (max-width:620px){.dialog-backdrop:has(.settings){padding-top:0;align-items:stretch}.dialog.settings{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}.settings-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}.settings-nav{flex-direction:row;border-right:0;border-bottom:1px solid var(--line);overflow-x:auto}.settings-nav button{flex:none}.settings-nav button small{display:none}}

.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.bar{display:flex;align-items:center;gap:4px;padding:0 10px 0 14px;border-bottom:1px solid var(--line);height:42px;flex:none}
.bar h1{font-size:13.5px;margin:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.chip{font-size:11.5px;padding:1px 7px;border-radius:99px;background:var(--raise);color:var(--dim);white-space:nowrap;display:inline-flex;align-items:center;gap:5px;margin-right:4px}
.chip.busy{background:var(--blue-soft);color:var(--blue)}
.chip.paused{background:var(--orange-soft);color:var(--warn)}
.chip.awake{color:var(--ok)}
.feed{flex:1;overflow-x:hidden;overflow-y:auto;padding:16px 20px 8px;position:relative}
.jump{display:none;position:sticky;bottom:8px;margin:0 auto;left:0;right:0;width:max-content;padding:6px 12px;border-radius:999px;border:1px solid var(--line2);background:var(--raise);color:var(--fg);font:500 12px var(--sans);box-shadow:0 2px 8px rgb(0 0 0 / .15);cursor:pointer;z-index:2}
.feed.reading .jump{display:block}
.feed-inner{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.msg{display:flex;flex-direction:column;gap:2px}
.label{font-size:11.5px;color:var(--faint);display:flex;gap:6px;align-items:center}
.msg.user{align-items:flex-end}
.msg.user .body{background:var(--you);border:1px solid var(--you-line);border-radius:12px;padding:8px 12px;max-width:85%;white-space:pre-wrap;word-break:break-word}
.msg.assistant .body{white-space:pre-wrap;word-break:break-word}
.thinking{margin:6px 0;color:var(--dim);font-size:13px}.thinking summary{cursor:pointer;display:flex;gap:6px;align-items:center;list-style:none}.thinking summary::-webkit-details-marker{display:none}.thinking .body{border-left:2px solid var(--line,#8884);padding:2px 10px;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;font-style:italic}
.msg.summary .body{border-left:2px solid var(--blue);padding:2px 10px;color:var(--dim);white-space:pre-wrap;font-size:13px;max-height:160px;overflow:auto}
.msg .body pre.code{margin:6px 0;padding:8px 10px;background:var(--raise);border-radius:6px;font:12px/1.5 var(--mono);white-space:pre-wrap;overflow:auto}
.tool summary{list-style:none;cursor:pointer;padding:1px 0;display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dim)}
.tool summary::-webkit-details-marker{display:none}
.tool summary:hover b{color:var(--blue)}
.tool summary b{font-weight:500;color:var(--text)}
.tool summary .arg{font-family:var(--mono);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;color:var(--faint)}
.tool .caret{display:inline-block;transition:transform .12s;color:var(--faint);width:10px;font-size:10px}
.tool[open] .caret{transform:rotate(90deg)}
.tool pre{margin:4px 0 4px 16px;padding:8px 10px;background:var(--raise);border-radius:6px;font:12px/1.5 var(--mono);color:var(--dim);white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto}
.tool.failed summary b{color:var(--bad)}
.spin{width:11px;height:11px;border:1.5px solid var(--line2);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite;flex:none}
@keyframes spin{to{transform:rotate(360deg)}}
.composer{padding:6px 20px calc(14px + env(safe-area-inset-bottom));flex:none}
.composer-inner{max-width:720px;margin:0 auto;border:1px solid var(--line2);border-radius:12px;padding:8px 8px 6px 12px;background:var(--bg);box-shadow:0 1px 3px rgba(0,0,0,.05)}
.composer-inner:focus-within{border-color:var(--blue)}
.composer textarea{display:block;border:0;padding:2px 0;min-height:24px;max-height:min(50dvh,calc(100dvh - 220px));resize:none;overflow-y:hidden;overflow-x:hidden;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;box-sizing:border-box;max-width:100%}
.composer-inner{min-width:0}
.composer-inner{container-type:inline-size}
.composer-foot{display:flex;align-items:center;gap:8px;min-width:0}
.composer-foot>.meter{flex:0 1 auto;min-width:0}
.composer-foot .meter .pop-wrap:first-child{min-width:0;flex:0 1 auto}
.composer-foot #model{max-width:100%;overflow:hidden;text-overflow:ellipsis;display:block;line-height:22px}
.composer-foot .meter .pop-wrap:not(:first-child){flex:none}
.hint{flex:1 1 0;min-width:0;font-size:11.5px;line-height:15px;color:var(--faint);text-align:right;overflow-wrap:break-word}
.composer-foot>#send,.composer-foot>#stop{flex:none;margin-left:auto}
@container (max-width:440px){.hint{display:none}}
#send{width:28px;height:28px;padding:0;justify-content:center;border-radius:50%;background:var(--orange);color:#fff;font-size:15px}
#send:hover:not(:disabled){background:var(--orange);color:#fff;opacity:.9}
#send .spin{border-color:rgba(255,255,255,.4);border-top-color:#fff}

.panel{border-left:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;min-width:0;min-height:0}
.tabs{display:flex;gap:2px;padding:0 6px;border-bottom:1px solid var(--line);height:42px;align-items:center;flex:none;min-width:0}
.tab-strip{display:flex;gap:2px;align-items:center;min-width:0;overflow-x:auto;scrollbar-width:none;flex:1}
.tab-strip::-webkit-scrollbar{display:none}
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dim) 35%,transparent) transparent}
::-webkit-scrollbar{width:6px;height:6px;background:transparent}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dim) 35%,transparent);border-radius:6px}
::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--dim) 60%,transparent)}
.tab-sep{width:1px;height:18px;background:var(--line);margin:0 4px;flex:none}
.tab{display:inline-flex;align-items:center;border-radius:6px;flex:none}
.tab .tab-main{padding:3px 8px;font-size:12.5px}
.tab .tab-x{padding:0 5px 0 0;color:var(--faint);visibility:hidden;font-size:14px}
.tab:hover .tab-x,.tab.on .tab-x{visibility:visible}
.tab .tab-x:hover{background:transparent;color:var(--text)}
.tab.on{background:var(--raise)}
.tab.on .tab-main{color:var(--text)}
.tab .tab-main:hover{background:transparent}
.add-wrap{position:relative;flex:none}
.tab-add{width:24px;height:24px;padding:0;justify-content:center;font-size:15px}
.add-menu{position:fixed;margin-top:4px;background:var(--bg);border:1px solid var(--line2);border-radius:8px;padding:3px;z-index:20;box-shadow:0 10px 30px rgba(0,0,0,.14);display:flex;flex-direction:column;min-width:140px}
.add-menu[hidden]{display:none}
.add-menu button{justify-content:flex-start;padding:5px 9px}
.surface{height:100%;display:flex;flex-direction:column;min-height:0;position:relative}
.term-surface{background:var(--term-bg)}
.term-host{flex:1;min-height:0;padding:6px 0 0 8px;--ct-bg:var(--term-bg);--ct-fg:var(--term-fg);--ct-font:var(--mono);--ct-font-size:12.5px}
.surface-asleep{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:13px;color:var(--dim)}.surface-asleep button{border:1px solid var(--line2);background:var(--bg2,transparent);color:var(--fg);border-radius:8px;padding:6px 14px;cursor:pointer}
.term-status{position:absolute;inset:auto 10px 10px auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);background:var(--bg);border:1px solid var(--line2);border-radius:8px;padding:4px 9px}
.term-status[hidden]{display:none}
.urlbar{display:flex;gap:2px;align-items:center;padding:5px 6px;border-bottom:1px solid var(--line);flex:none}
.urlbar .url{font:12px var(--mono);padding:4px 9px;border-radius:99px;background:var(--raise);border-color:transparent}
.urlbar .url:focus{border-color:var(--blue);background:var(--bg)}
.stage{flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;background:var(--raise);overflow:hidden;position:relative}
.pane{flex:1;overflow:auto;min-height:0}
.term{display:flex;flex-direction:column;height:100%}
.term-log{flex:1;overflow:auto;padding:8px 12px;font:12px/1.55 var(--mono)}
.term-log .cmd{color:var(--text);word-break:break-word}
.term-log .cmd::before{content:"$ ";color:var(--orange)}
.term-log .out{color:var(--dim);white-space:pre-wrap;word-break:break-word;margin:1px 0 8px}
.term-log .out.bad{color:var(--bad)}
.term-log .tag{font-size:11px;color:var(--faint);margin-left:6px;font-family:var(--sans)}
.term-in{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line)}
.term-in input{font-family:var(--mono);font-size:12px}
.term-in button{border:1px solid var(--line2)}
.files{padding:4px 6px}
.crumbs{display:flex;flex-wrap:wrap;gap:3px;padding:6px 6px 4px;font:12px var(--mono)}
.crumbs a{color:var(--blue);cursor:pointer}
.row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:5px;cursor:pointer;font:12.5px var(--mono)}
.row:hover{background:var(--hover)}
.viewer{margin:0;padding:8px 10px;font:12px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word;color:var(--dim)}
.timeline{padding:4px 8px;display:flex;flex-direction:column}
.tl{padding:7px 6px;border-bottom:1px solid var(--line)}
.tl:last-child{border-bottom:0}
.tl .h{display:flex;justify-content:space-between;gap:8px;font-weight:500;font-size:13px}
.tl .h a{color:var(--blue);text-decoration:none;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl .d{font:11.5px var(--mono);color:var(--faint);margin-top:1px;word-break:break-all}

.empty{height:100%;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center}
.empty.inline{flex:1;min-height:100%;height:auto;padding:48px 0;margin:-16px -20px -8px;box-sizing:border-box}
.feed-inner:has(>.empty.inline){min-height:100%;max-width:none}
.empty-inner{max-width:400px;display:flex;flex-direction:column;gap:10px;align-items:center}
.empty h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.empty p{margin:0;color:var(--dim)}
.empty .primary{padding:5px 14px}
.mark{width:40px;height:40px;display:block}
.browser-body{flex:1;min-height:0;display:flex;flex-direction:column}
.vnc-stage{flex:1;min-height:0;background:#000;overflow:hidden;position:relative}
.vnc-stage canvas{outline:none}
.browser-status{padding:16px;color:var(--dim);font-size:13px}
.empty{background-image:url(/brand/loops-light.svg);background-repeat:repeat}
:root[data-theme=dark] .empty{background-image:url(/brand/loops-dark.svg)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .empty{background-image:url(/brand/loops-dark.svg)}}
.skeleton{display:flex;flex-direction:column;gap:8px;padding:10px}
.skeleton div{height:11px;border-radius:4px;background:linear-gradient(90deg,var(--raise),var(--hover),var(--raise));background-size:200% 100%;animation:shimmer 1.4s infinite}
.skeleton div:nth-child(2){width:72%}.skeleton div:nth-child(3){width:86%}
@keyframes shimmer{to{background-position:-200% 0}}
.err{margin:10px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--bad) 40%,transparent);background:color-mix(in srgb,var(--bad) 8%,transparent);border-radius:8px;font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:6px 12px;border-radius:8px;font-size:12.5px;z-index:30;max-width:90vw}
.toast.bad{background:var(--bad);color:#fff}

dialog{background:var(--bg);color:var(--text);border:1px solid var(--line2);border-radius:12px;padding:0;width:min(440px,92vw);box-shadow:0 20px 50px rgba(0,0,0,.18)}
dialog::backdrop{background:rgba(0,0,0,.3)}
.dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:50}
.dialog{background:var(--bg);color:var(--text);border:1px solid var(--line2);border-radius:12px;width:min(440px,92vw);box-shadow:0 20px 50px rgba(0,0,0,.18)}
.dialog form{display:flex;flex-direction:column;gap:10px;padding:16px}
.dialog h3{margin:0;font-size:15px;font-weight:600}
.dialog label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--dim)}
.dialog select{border:1px solid var(--line2);border-radius:8px;padding:6px 8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px}
.dialog .actions{display:flex;justify-content:flex-end;gap:6px;margin-top:4px}
.dialog .actions .primary{padding:5px 12px}
#root,.root{height:100%}
.feed-end{height:1px}
dialog form{display:flex;flex-direction:column;gap:10px;padding:16px}
dialog h3{margin:0;font-size:15px;font-weight:600}
dialog label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--dim)}
dialog select{border:1px solid var(--line2);border-radius:8px;padding:6px 8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px}
dialog .actions{display:flex;justify-content:flex-end;gap:6px;margin-top:4px}
dialog .actions .primary{padding:5px 12px}

.bar .actions{display:flex;gap:6px;align-items:center}
.icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.act-group{display:flex;gap:2px;align-items:center;padding:2px;border:1px solid var(--line);border-radius:10px;background:var(--raise)}
.act{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:30px;height:30px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dim)}
.act:hover:not(:disabled){background:var(--bg);color:var(--fg)}
.act:disabled{opacity:.4}
.act .spin{margin:0}
.act-label{display:none}
.size-wrap{position:relative;display:inline-flex}
.size-list{position:absolute;top:calc(100% + 6px);right:0;display:flex;flex-direction:column;min-width:150px;padding:4px;background:var(--bg);border:1px solid var(--line2);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.15);z-index:20}
.size-list[hidden]{display:none}
.size-list button{display:flex;align-items:center;gap:8px;padding:6px 10px;border:0;border-radius:6px;background:transparent;font:12.5px var(--mono);color:var(--fg);text-align:left}
.size-list button:hover,.size-list button.on{background:var(--raise)}
.size-list .tick{width:16px;display:inline-flex}
.md p{margin:0 0 .6em}
.md h3,.md h4,.md h5{margin:.8em 0 .4em;font-weight:600;line-height:1.3}
.md h3{font-size:1.1em}.md h4{font-size:1em}.md h5{font-size:.95em;color:var(--dim)}
.md ul,.md ol{margin:0 0 .6em;padding-left:1.4em}
.md li{margin:.15em 0}
.md blockquote{margin:0 0 .6em;padding-left:10px;border-left:2px solid var(--line2);color:var(--dim)}
.md hr{border:0;border-top:1px solid var(--line2);margin:.8em 0}
.md code{font:.9em var(--mono);background:var(--raise);padding:1px 4px;border-radius:4px}
.md pre code{background:transparent;padding:0}
.md a{color:var(--orange)}
.md>:last-child{margin-bottom:0}
.msg-tools{display:flex;gap:4px;justify-content:flex-end;opacity:0;transition:opacity .15s}
.msg:hover .msg-tools,.msg:focus-within .msg-tools{opacity:1}
pre.code{position:relative}
.code-copy{position:absolute;top:6px;right:6px;border:1px solid var(--line2);background:var(--raise);color:var(--dim);font:500 11px var(--sans);padding:2px 8px;border-radius:6px;opacity:0;transition:opacity .15s}
pre.code:hover .code-copy,pre.code:focus-within .code-copy{opacity:1}
@media (hover:none){.code-copy{opacity:1}}
.msg.note{color:var(--dim);font-size:13px;font-style:italic}
.msg.error .error-summary{color:var(--bad);margin:0}
.error-detail summary{cursor:pointer;color:var(--dim);font-size:12px}
.error-detail pre{white-space:pre-wrap;word-break:break-word;font:12px var(--mono);color:var(--dim)}
.connection{position:sticky;top:0;z-index:3;margin:0 auto 8px;width:max-content;max-width:100%;padding:4px 12px;border-radius:999px;border:1px solid var(--line2);background:var(--raise);color:var(--warn);font-size:12px;display:flex;gap:8px;align-items:center}
.connection.lost{color:var(--bad);border-radius:10px}
.connection button{border:1px solid var(--line2);background:transparent;color:var(--fg);border-radius:6px;padding:1px 8px;font-size:12px}
.starters{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}
.starter{border:1px solid var(--line2);background:var(--raise);color:var(--fg);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}
.starter:hover{border-color:var(--fg)}
.list-filter{width:calc(100% - 16px);margin:4px 8px 6px;padding:5px 8px;border:1px solid var(--line2);border-radius:6px;background:var(--raise);color:var(--text);font:inherit;font-size:13px}
.row{position:relative}
.row .item{padding-right:28px}
.row-more{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--faint);width:22px;height:22px;border-radius:5px;cursor:pointer;opacity:0}
.row:hover .row-more,.row-more:focus-visible,.row.menu-open .row-more{opacity:1}
@media (pointer:coarse){.row-more{opacity:1}}
.row-more:hover{background:var(--line)}
.row-menu{position:absolute;right:4px;top:100%;z-index:30;display:flex;flex-direction:column;min-width:120px;padding:4px;border:1px solid var(--line2);border-radius:8px;background:var(--raise);box-shadow:0 6px 20px rgb(0 0 0/.18)}
.row-menu button{border:0;background:transparent;color:var(--text);text-align:left;padding:5px 8px;border-radius:5px;font-size:13px;cursor:pointer}
.row-menu button:hover{background:var(--line)}
.tool-time{margin-left:auto;font:500 11px var(--mono);color:var(--dim)}
.enter-hint{font-size:11px;color:var(--faint)}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media (hover:none){.msg-tools{opacity:1}}
.msg-tools button{border:0;background:transparent;font-size:11.5px;color:var(--dim);padding:2px 6px;border-radius:6px}
.msg-tools button:hover{color:var(--fg);background:var(--raise)}
.palette{width:min(560px,92vw);padding:6px;align-self:flex-start;margin-top:12vh}
#palette-input{width:100%;border:0;border-bottom:1px solid var(--line2);background:transparent;padding:10px;font-size:15px;color:var(--fg);outline:none}
.palette-list{display:flex;flex-direction:column;max-height:50vh;overflow:auto;padding-top:4px}
.palette-list button{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:var(--fg);text-align:left;font-size:13.5px}
.palette-list button.on,.palette-list button:hover{background:var(--raise)}
.palette-hint,.palette-empty{font:11.5px var(--mono);color:var(--dim)}
.palette-empty{padding:10px}
.turn summary{list-style:none;cursor:pointer}
.turn summary::-webkit-details-marker{display:none}
.diff{margin:6px 0 0;padding:8px;max-height:50vh;overflow:auto;background:var(--raise);border-radius:6px;font:11.5px/1.45 var(--mono);white-space:pre}
.diff .da{color:#1a7f37}.diff .dd{color:#cf222e}.diff .dk{color:var(--dim)}.diff .dh{font-weight:600}
[data-theme=dark] .diff .da{color:#3fb950}[data-theme=dark] .diff .dd{color:#f85149}
.meter{display:flex;align-items:center;gap:4px;min-width:0}
.pop-wrap{position:relative;display:inline-flex}
.pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border:1px solid var(--line2);border-radius:999px;background:transparent;font:11.5px var(--mono);color:var(--dim);white-space:nowrap}
.pill:hover{color:var(--fg);background:var(--raise)}
.ring{position:relative;flex:none;border-radius:50%;background:conic-gradient(var(--ring,var(--line2)) var(--share,0%),var(--line) 0)}
.ring::after{content:"";position:absolute;border-radius:50%;background:var(--bg)}
.ring.small{width:18px;height:18px}.ring.small::after{inset:3px}
.ring.big{width:32px;height:32px}.ring.big::after{inset:4px}
button.usage{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent}
button.usage:hover{background:var(--hover)}
.usage-head{display:flex;align-items:center;gap:10px;padding:2px 0 6px}
.usage-head b{display:block;font-weight:500;font-size:13px;color:var(--fg)}
.usage-head span{font:12px var(--mono);color:var(--dim);white-space:nowrap}
.usage-hint{margin:6px 0 0;padding-top:6px;border-top:1px solid var(--line);font-size:12px;color:var(--dim)}
.ran{display:flex;align-items:center;gap:10px;margin:2px 0 6px;font:12px var(--mono);color:var(--faint)}
.ran-label{display:inline-flex;align-items:center;gap:8px}
.ran::before,.ran::after{content:"";flex:1;height:1px;background:var(--line)}
@media (hover:hover){
  .bar,.tabs{position:relative;z-index:40}
  [data-tip]{position:relative}
  [data-tip]:hover::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:5px 8px;border-radius:6px;background:var(--fg);color:var(--bg);font:400 12px/1.2 var(--sans);pointer-events:none;z-index:60}
  .composer [data-tip]:hover::after,.meter [data-tip]:hover::after,.side .who [data-tip]:hover::after{top:auto;bottom:calc(100% + 6px)}
  .side [data-tip]:hover::after{left:auto;right:0;transform:none}
  .pop-wrap:has(.usage-pop:not([hidden])) [data-tip]::after,.pop-wrap:has(.model-list:not([hidden])) [data-tip]::after{display:none}
}
.model-list,.usage-pop{position:absolute;bottom:calc(100% + 6px);left:0;display:flex;flex-direction:column;min-width:240px;padding:4px;background:var(--bg);border:1px solid var(--line2);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.15);z-index:30}
.model-list[hidden],.usage-pop[hidden]{display:none}
.model-list button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:6px 10px;border:0;border-radius:6px;background:transparent;color:var(--fg);text-align:left}
.model-list button:hover,.model-list button.on,.model-list button.active{background:var(--raise)}
.model-list{width:min(380px,calc(100vw - 32px));max-height:min(480px,70vh)}
.model-search{margin:2px 2px 6px;padding:7px 10px;border:1px solid var(--line2);border-radius:7px;background:var(--raise);color:var(--fg);font:inherit;font-size:13px;outline:none}
.model-search:focus{border-color:var(--orange)}
.model-options{overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:1px}
.model-group{padding:8px 10px 3px;font:600 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.model-list button.active{outline:1px solid var(--line2)}
.model-list button.on .model-name::after{content:" ✓";color:var(--orange)}
.model-id{font:11px var(--mono);color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.model-empty,.model-more{padding:10px;color:var(--dim);font-size:12px}
.model-name{font-size:13px}
.model-meta{font:11px var(--mono);color:var(--dim)}
.usage-pop{padding:10px 12px;gap:4px;min-width:230px}
.usage-row{display:flex;justify-content:space-between;gap:16px;font:12px var(--mono);color:var(--dim)}
.usage-row b{color:var(--fg);font-weight:500}
#stop{display:inline-flex;align-items:center;justify-content:center}
#stop .icon{width:14px;height:14px;fill:currentColor}
.item.archived{display:flex;align-items:center;gap:8px;opacity:.7}
.item.archived .restore{margin-left:auto;border:1px solid var(--line2);border-radius:6px;background:transparent;font-size:11.5px;color:var(--fg);padding:2px 8px}
.tab-main .icon{width:14px;height:14px;margin-right:5px;vertical-align:-2px}
.bar .panel-toggle{display:none!important}
.more{display:none!important}
.narrow{display:none!important}
.side{grid-column:1;grid-row:1;min-width:0;overflow:hidden}.main{grid-column:2;grid-row:1}.panel{grid-column:3;grid-row:1;overflow:hidden}
.side,.main,.panel{container-type:inline-size}
.app{position:relative}
.resizer{position:absolute;top:0;bottom:0;z-index:6;width:10px;cursor:col-resize;touch-action:none}
.side-resizer{left:calc(var(--side-w,248px) - 5px)}
.panel-resizer{right:calc(var(--panel-w,480px) - 5px)}
.resizer:hover::after,.resizer.active::after{content:'';position:absolute;top:0;bottom:0;left:4px;width:2px;background:var(--blue);opacity:.7}
.resizing,.resizing *{cursor:col-resize!important;user-select:none!important}
.resizing .panel *,.resizing .main *{pointer-events:none}
.collapse{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;color:var(--dim);background:transparent;border:0;flex:none}
.collapse:hover{background:var(--hover);color:var(--fg)}
.collapse .icon{width:16px;height:16px}
.side-hidden .side,.side-hidden .side-resizer{display:none}
.panel-hidden .panel,.panel-hidden .panel-resizer{display:none}
@container (max-width:620px){
  .bar{position:relative}
  .more{display:inline-flex!important}
  .bar .actions{display:none;position:absolute;top:calc(100% + 4px);right:6px;flex-direction:column;align-items:stretch;background:var(--bg);border:1px solid var(--line2);border-radius:10px;padding:4px;z-index:12;min-width:150px;box-shadow:0 12px 30px rgba(0,0,0,.15)}
  .bar .actions.open{display:flex}
  .act-group{flex-direction:column;align-items:stretch;border:0;padding:0;background:transparent}
  .act{width:auto;height:auto;justify-content:flex-start;padding:8px 10px;color:var(--fg)}
  .act-label{display:inline}
  .size-wrap{flex-direction:column}
  .size-list{position:static;box-shadow:none;border:0;border-left:2px solid var(--line2);border-radius:0;margin:2px 0 4px 18px;padding:0 0 0 6px}
}
@container (max-width:420px){
  .tab-main .icon{margin-right:0}
  .tab-label{display:none}
}
@container (max-width:460px){
  .bar h1{font-size:13px}
  .feed{padding:12px 12px 6px}
  .composer{padding:6px 10px 10px}
  .msg.user .body{max-width:92%}
}
@media (max-width:720px){
  .app{grid-template-columns:100%}
  .main{grid-column:1}
  .resizer,.collapse{display:none!important}
  .side,.panel{display:none}
  .app.show-side .side{display:flex;position:fixed;inset:0;z-index:15;padding-top:env(safe-area-inset-top)}
  .app.show-panel .panel{display:flex;position:fixed;inset:0;z-index:15;padding-top:env(safe-area-inset-top);box-sizing:border-box}
  .bar .panel-toggle{display:inline-flex!important}
  .narrow.panel-close{display:inline-flex!important}
  .narrow{display:inline-flex!important}
  .bar{padding:0 6px;position:relative}
  .more{display:inline-flex!important}
  .bar .actions{display:none;position:absolute;top:calc(100% + 4px);right:6px;flex-direction:column;align-items:stretch;background:var(--bg);border:1px solid var(--line2);border-radius:10px;padding:4px;z-index:12;min-width:150px;box-shadow:0 12px 30px rgba(0,0,0,.15)}
  .bar .actions.open{display:flex}
  .act-group{flex-direction:column;align-items:stretch;border:0;padding:0;background:transparent}
  .act{width:auto;height:auto;justify-content:flex-start;padding:8px 10px;color:var(--fg)}
  .act-label{display:inline}
  .size-wrap{flex-direction:column}
  .size-list{position:static;box-shadow:none;border:0;border-left:2px solid var(--line2);border-radius:0;margin:2px 0 4px 18px;padding:0 0 0 6px}
  .feed{padding:12px 12px 6px}
  .composer{padding:6px 10px 10px}
  .msg.user .body{max-width:92%}
}
`;
