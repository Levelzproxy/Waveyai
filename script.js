/* ============================================================
   Wavey AI — application logic
   One file, zero dependencies.
   ============================================================ */
'use strict';

(function () {
  /* ----------------------------------------------------------
     0. tiny helpers
     ---------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const FENCE = '```';

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function abortError() {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const t = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(abortError());
        }, { once: true });
      }
    });
  }

  const escapeLight = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function timeLabel(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function plainText(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_>#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripForSnippet(s) {
    return plainText(s).slice(0, 90);
  }

  function isNearBottom() {
    const box = el.chatScroll;
    if (!box) return true;
    return box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  }

  function scrollToBottom(smooth) {
    const box = el.chatScroll;
    if (!box) return;
    try {
      box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    } catch (e) {
      box.scrollTop = box.scrollHeight;
    }
  }

  function slugify(s) {
    return String(s || 'chat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chat';
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ----------------------------------------------------------
     1. constants
     ---------------------------------------------------------- */
  const STORE_KEY = 'wavey.ai.v1';
  const MAX_INPUT = 12000;
  const MAX_ATTACHMENTS = 4;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_TEXT_BYTES = 400 * 1024;
  const MAX_TEXT_CHARS = 18000;

  const MODELS = [
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini', note: 'Fast and inexpensive' },
    { id: 'gpt-4o', label: 'gpt-4o', note: 'Multimodal, strong all-round' },
    { id: 'gpt-4.1', label: 'gpt-4.1', note: 'Long context, precise' },
    { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', note: 'Everyday small model' },
    { id: 'o4-mini', label: 'o4-mini', note: 'Reasoning, quick' },
    { id: 'o3', label: 'o3', note: 'Deep reasoning' }
  ];

  const DEFAULTS = {
    name: '',
    theme: 'system',
    fontSize: 'medium',
    systemPrompt: '',
    sendOnEnter: true,
    stream: true,
    showTimes: true,
    temperature: 0.7,
    provider: 'local',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini'
  };

  /* ----------------------------------------------------------
     2. element refs
     ---------------------------------------------------------- */
  const el = {};
  [
    'app', 'scrim', 'sidebar', 'sidebarClose', 'newChatBtn', 'convSearch', 'searchClear',
    'convScroll', 'conversationList', 'convEmpty', 'settingsBtn', 'themeBtn', 'profileBtn',
    'profileAvatar', 'profileName', 'main', 'menuBtn', 'chatTitle', 'chatMeta', 'modelBtn',
    'engineDot', 'modelLabel', 'modelMenu', 'exportBtn', 'moreBtn', 'moreMenu', 'pinLabel',
    'chatScroll', 'welcome', 'welcomeTitle', 'welcomeSub', 'suggestions', 'messages',
    'scrollBottomBtn', 'composerForm', 'attachmentStrip', 'attachBtn', 'fileInput',
    'promptInput', 'micBtn', 'sendBtn', 'enginePill', 'enginePillText', 'composerHint',
    'charCount', 'toasts', 'settingsModal', 'settingsTitle', 'settingsTabs', 'setName',
    'themeSeg', 'setFont', 'setSystem', 'setEnter', 'setStream', 'setTimes', 'tempVal',
    'setTemp', 'modelCallout', 'modelCalloutText', 'setProvider', 'setBase', 'setKey',
    'toggleKey', 'clearKey', 'setModel', 'modelList', 'testConn', 'connResult', 'exportAll',
    'exportChat', 'importBtn', 'importInput', 'clearAll', 'resetSettings', 'storageBar',
    'storageText', 'aboutShortcuts', 'shortcutsModal', 'confirmModal', 'confirmTitle',
    'confirmBody', 'confirmCancel', 'confirmOk'
  ].forEach((id) => { el[id] = document.getElementById(id); });

  const composerBox = el.composerForm ? el.composerForm.querySelector('.composer-box') : null;

  /* ----------------------------------------------------------
     3. state
     ---------------------------------------------------------- */
  let state = {
    conversations: [],
    activeId: null,
    settings: Object.assign({}, DEFAULTS)
  };

  const ui = {
    streaming: false,
    abort: null,
    stick: true,
    attachments: [],
    editing: null,
    renamingId: null,
    query: '',
    speakingId: null,
    recording: false,
    confirmResolve: null,
    modal: null,
    saveTimer: null,
    lastPaint: 0
  };

  /* ----------------------------------------------------------
     4. persistence
     ---------------------------------------------------------- */
  function normalizeAttachment(a) {
    if (!a || typeof a !== 'object') return null;
    if (a.kind === 'image') {
      if (!a.dataUrl || !/^data:image\//.test(a.dataUrl)) return null;
      return { id: a.id || uid(), kind: 'image', name: String(a.name || 'image'), size: +a.size || 0, mime: String(a.mime || 'image/png'), dataUrl: a.dataUrl };
    }
    return {
      id: a.id || uid(),
      kind: 'text',
      name: String(a.name || 'file.txt'),
      size: +a.size || 0,
      mime: String(a.mime || 'text/plain'),
      text: String(a.text || '').slice(0, MAX_TEXT_CHARS)
    };
  }

  function normalizeMessage(m) {
    if (!m || typeof m !== 'object') return null;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    return {
      id: m.id || uid(),
      role,
      content: String(m.content || ''),
      ts: +m.ts || Date.now(),
      attachments: Array.isArray(m.attachments) ? m.attachments.map(normalizeAttachment).filter(Boolean) : [],
      model: typeof m.model === 'string' ? m.model : '',
      engine: m.engine === 'cloud' ? 'cloud' : 'local',
      status: m.status === 'error' ? 'error' : m.status === 'stopped' ? 'stopped' : m.status === 'streaming' ? 'stopped' : 'done',
      error: m.error && typeof m.error === 'object' ? { title: String(m.error.title || 'Error'), message: String(m.error.message || '') } : null,
      feedback: m.feedback === 'up' || m.feedback === 'down' ? m.feedback : null
    };
  }

  function normalizeConversation(c) {
    if (!c || typeof c !== 'object') return null;
    return {
      id: c.id || uid(),
      title: String(c.title || 'New chat'),
      messages: Array.isArray(c.messages) ? c.messages.map(normalizeMessage).filter(Boolean) : [],
      pinned: !!c.pinned,
      createdAt: +c.createdAt || Date.now(),
      updatedAt: +c.updatedAt || Date.now()
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.conversations)) {
        state.conversations = data.conversations.map(normalizeConversation).filter(Boolean);
      }
      if (data && data.activeId && state.conversations.some((c) => c.id === data.activeId)) {
        state.activeId = data.activeId;
      }
      if (data && data.settings && typeof data.settings === 'object') {
        state.settings = Object.assign({}, DEFAULTS, data.settings);
      }
    } catch (e) {
      state.conversations = [];
      state.activeId = null;
    }
  }

  function saveSoon() {
    clearTimeout(ui.saveTimer);
    ui.saveTimer = setTimeout(writeNow, 160);
  }

  function writeNow() {
    clearTimeout(ui.saveTimer);
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      activeId: state.activeId,
      settings: state.settings,
      conversations: state.conversations
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
      return;
    } catch (e) {
      /* storage full — drop image bytes and retry once */
    }
    let stripped = false;
    state.conversations.forEach((c) => {
      c.messages.forEach((m) => {
        (m.attachments || []).forEach((a) => {
          if (a.kind === 'image' && a.dataUrl) {
            delete a.dataUrl;
            stripped = true;
          }
        });
      });
    });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
      if (stripped) toast('Storage was full — image previews were trimmed to keep your chats.', 'error');
    } catch (e) {
      toast('Could not save to this browser. Storage may be full or blocked.', 'error');
    }
  }

  function storageInfo() {
    let bytes = 0;
    try {
      bytes = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
    } catch (e) { bytes = 0; }
    const cap = 5 * 1024 * 1024;
    const pct = Math.min(100, (bytes / cap) * 100);
    if (el.storageBar) el.storageBar.style.width = pct.toFixed(1) + '%';
    if (el.storageText) {
      el.storageText.textContent = formatBytes(bytes) + ' used · ' + state.conversations.length +
        (state.conversations.length === 1 ? ' chat' : ' chats') + ' · about 5 MB available in this browser';
    }
  }

  /* ----------------------------------------------------------
     5. theme & profile
     ---------------------------------------------------------- */
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function resolvedTheme() {
    if (state.settings.theme === 'system') return media && media.matches ? 'light' : 'dark';
    return state.settings.theme === 'light' ? 'light' : 'dark';
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', resolvedTheme());
  }

  function applyFont() {
    const size = ['small', 'medium', 'large'].includes(state.settings.fontSize) ? state.settings.fontSize : 'medium';
    document.documentElement.setAttribute('data-font', size);
  }

  function applyIdentity() {
    const name = (state.settings.name || '').trim();
    if (el.profileName) el.profileName.textContent = name || 'You';
    if (el.profileAvatar) el.profileAvatar.textContent = (name ? name[0] : 'Y').toUpperCase();
  }

  function cycleTheme() {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    state.settings.theme = next;
    applyTheme();
    syncSettingsUI();
    saveSoon();
    toast(next === 'dark' ? 'Dark theme' : 'Light theme');
  }

  /* ----------------------------------------------------------
     6. toasts, confirm, modals, menus
     ---------------------------------------------------------- */
  function toast(message, kind) {
    if (!el.toasts) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind === 'error' ? ' is-error' : '');
    node.innerHTML = '<svg class="ico"><use href="#' + (kind === 'error' ? 'i-alert' : 'i-check') + '"/></svg><span>' +
      escapeLight(message) + '</span>';
    el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 220);
    }, kind === 'error' ? 4200 : 2600);
  }

  function confirmDialog(opts) {
    const options = opts || {};
    return new Promise((resolve) => {
      if (ui.confirmResolve) ui.confirmResolve(false);
      ui.confirmResolve = resolve;
      if (el.confirmTitle) el.confirmTitle.textContent = options.title || 'Are you sure?';
      if (el.confirmBody) el.confirmBody.textContent = options.body || '';
      if (el.confirmOk) {
        el.confirmOk.textContent = options.confirmText || 'Delete';
        el.confirmOk.className = 'btn ' + (options.danger === false ? 'btn-primary' : 'btn-danger');
      }
      openModal('confirm');
    });
  }

  function resolveConfirm(value) {
    if (!ui.confirmResolve) return;
    const fn = ui.confirmResolve;
    ui.confirmResolve = null;
    fn(value);
  }

  function openModal(name) {
    const node = el[name + 'Modal'];
    if (!node) return;
    closeMenus();
    $$('.modal').forEach((m) => { if (m !== node) m.hidden = true; });
    node.hidden = false;
    ui.modal = name;
    if (name === 'settings') {
      syncSettingsUI();
      storageInfo();
    }
  }

  function closeModal(name) {
    const key = name || ui.modal;
    if (!key) return;
    const node = el[key + 'Modal'];
    if (node) node.hidden = true;
    if (key === 'confirm') resolveConfirm(false);
    ui.modal = null;
  }

  function toggleMenu(button, menu) {
    if (!menu) return;
    const wasOpen = !menu.hidden;
    closeMenus();
    if (!wasOpen) {
      if (menu === el.modelMenu) buildModelMenu();
      menu.hidden = false;
      if (button) button.setAttribute('aria-expanded', 'true');
    }
  }

  function closeMenus() {
    [el.modelMenu, el.moreMenu].forEach((m) => { if (m) m.hidden = true; });
    [el.modelBtn, el.moreBtn].forEach((b) => { if (b) b.setAttribute('aria-expanded', 'false'); });
  }

  function switchSettingsTab(name) {
    $$('#settingsTabs .tab').forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.tab-panel').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === name);
    });
  }

  /* ----------------------------------------------------------
     7. markdown + syntax highlighting
     ---------------------------------------------------------- */
  const LANG_JS = 'const let var function return if else for while do break continue class extends new delete typeof instanceof in of switch case default try catch finally throw async await import export from as this super yield static get set null undefined true false';
  const LANG_PY = 'def class return if elif else for while break continue import from as try except finally raise with lambda pass yield global nonlocal async await None True False and or not in is assert del print';
  const LANG_SQL = 'select from where join left right inner outer on group by order having limit offset insert into values update set delete create table alter drop index distinct as count sum avg min max union all and or not null is like in between case when then else end asc desc';
  const LANG_SH = 'if then else elif fi for in do done case esac function return echo cd ls pwd cat rm mv cp mkdir touch grep sed awk export sudo npm node git docker curl';

  function makeSpec(comment, keywords, flags) {
    const parts = [];
    const classes = [];
    if (comment) { parts.push('(' + comment + ')'); classes.push('com'); }
    parts.push('("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)');
    classes.push('str');
    parts.push('\\b(' + keywords.split(' ').filter(Boolean).map(escapeRe).join('|') + ')\\b');
    classes.push('kw');
    parts.push('\\b(\\d+(?:\\.\\d+)?)\\b');
    classes.push('num');
    parts.push('([A-Za-z_$][\\w$]*)(?=\\s*\\()');
    classes.push('fn');
    return { pattern: parts.join('|'), classes, flags: flags || 'g' };
  }

  const SPECS = {
    js: makeSpec('\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', LANG_JS),
    py: makeSpec('#[^\\n]*', LANG_PY),
    sql: makeSpec('--[^\\n]*', LANG_SQL, 'gi'),
    sh: makeSpec('#[^\\n]*', LANG_SH),
    json: {
      pattern: '("(?:\\\\.|[^"\\\\])*")(?=\\s*:)|("(?:\\\\.|[^"\\\\])*")|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?)',
      classes: ['prop', 'str', 'lit', 'num'],
      flags: 'g'
    },
    css: {
      pattern: '(\\/\\*[\\s\\S]*?\\*\\/)|("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|(@[\\w-]+)|([a-z-]+)(?=\\s*:)|(#[0-9a-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?\\b)',
      classes: ['com', 'str', 'kw', 'prop', 'num'],
      flags: 'g'
    },
    html: {
      pattern: '(<!--[\\s\\S]*?-->)|(<\\/?[A-Za-z][\\w:-]*)|([A-Za-z-]+)(?==)|("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')',
      classes: ['com', 'tag', 'attr', 'str'],
      flags: 'g'
    }
  };

  const LANG_ALIASES = {
    js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js',
    py: 'py', python: 'py',
    sql: 'sql',
    sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
    json: 'json',
    css: 'css', scss: 'css',
    html: 'html', htm: 'html', xml: 'html', svg: 'html'
  };

  function highlight(code, lang) {
    const key = LANG_ALIASES[String(lang || '').toLowerCase()];
    const spec = key ? SPECS[key] : null;
    if (!spec) return escapeHtml(code);
    let re;
    try {
      re = new RegExp(spec.pattern, spec.flags);
    } catch (e) {
      return escapeHtml(code);
    }
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(code)) !== null) {
      if (match.index === re.lastIndex) re.lastIndex++;
      out += escapeHtml(code.slice(last, match.index));
      let cls = '';
      for (let i = 1; i < match.length; i++) {
        if (match[i] !== undefined) { cls = spec.classes[i - 1] || ''; break; }
      }
      out += '<span class="tok-' + cls + '">' + escapeHtml(match[0]) + '</span>';
      last = match.index + match[0].length;
    }
    out += escapeHtml(code.slice(last));
    return out;
  }

  function codeBlockHtml(lang, code) {
    const cleanLang = String(lang || '').trim().toLowerCase();
    return '<div class="code-block"><div class="code-head"><span class="code-lang">' +
      escapeLight(cleanLang || 'code') + '</span><button type="button" class="code-copy" data-copy-code>' +
      '<svg class="ico"><use href="#i-copy"/></svg>Copy</button></div><pre><code>' +
      highlight(code, cleanLang) + '</code></pre></div>';
  }

  function inlineMd(text) {
    const codes = [];
    let s = text.replace(/`([^`\n]+)`/g, (m, c) => {
      codes.push(c);
      return '\u0001' + (codes.length - 1) + '\u0001';
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
      const safe = /^(https?:\/\/)/i.test(url) ? url : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + (alt || 'image') + '</a>';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const safe = /^(https?:\/\/|mailto:)/i.test(url) ? url : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code class="inline">' + codes[+i] + '</code>');
    return s;
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  }

  function buildList(items, start, level) {
    const ordered = items[start].ordered;
    let html = '<' + (ordered ? 'ol' : 'ul') + '>';
    let i = start;
    while (i < items.length && items[i].level >= level) {
      if (items[i].level > level) break;
      let text = items[i].text;
      if (/^\[[ xX]\]\s/.test(text)) {
        text = (text[1] !== ' ' ? '☑ ' : '☐ ') + text.slice(4);
      }
      html += '<li>' + inlineMd(text);
      i++;
      if (i < items.length && items[i].level > level) {
        const sub = buildList(items, i, items[i].level);
        html += sub.html;
        i = sub.next;
      }
      html += '</li>';
    }
    html += '</' + (ordered ? 'ol' : 'ul') + '>';
    return { html, next: i };
  }

  function markdown(source) {
    const text = String(source || '').replace(/\r\n?/g, '\n');
    const blocks = [];
    let body = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
      blocks.push({ lang: String(lang || '').trim(), code: code.replace(/\n$/, '') });
      return '\n\u0000CODE' + (blocks.length - 1) + '\u0000\n';
    });
    body = escapeLight(body);

    const lines = body.split('\n');
    let html = '';
    let paragraph = [];
    let listItems = [];
    let quote = [];
    let i = 0;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html += '<p>' + paragraph.map(inlineMd).join('<br>') + '</p>';
      paragraph = [];
    };
    const flushList = () => {
      if (!listItems.length) return;
      html += buildList(listItems, 0, 0).html;
      listItems = [];
    };
    const flushQuote = () => {
      if (!quote.length) return;
      html += '<blockquote>' + quote.map(inlineMd).join('<br>') + '</blockquote>';
      quote = [];
    };
    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      const codeMatch = trimmed.match(/^\u0000CODE(\d+)\u0000$/);
      if (codeMatch) {
        flushAll();
        const block = blocks[+codeMatch[1]];
        html += codeBlockHtml(block.lang, block.code);
        i++;
        continue;
      }

      if (!trimmed) {
        flushAll();
        i++;
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        flushAll();
        const level = heading[1].length;
        html += '<h' + level + '>' + inlineMd(heading[2]) + '</h' + level + '>';
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushAll();
        html += '<hr>';
        i++;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flushParagraph();
        flushList();
        quote.push(trimmed.replace(/^>\s?/, ''));
        i++;
        continue;
      }

      if (trimmed.includes('|') && lines[i + 1] && lines[i + 1].includes('-') &&
          /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        flushAll();
        const header = splitRow(trimmed);
        const aligns = splitRow(lines[i + 1]).map((c) => {
          if (/^:-+:$/.test(c)) return 'center';
          if (/-+:$/.test(c)) return 'right';
          return 'left';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        html += '<table><thead><tr>' + header.map((h, idx) =>
          '<th style="text-align:' + (aligns[idx] || 'left') + '">' + inlineMd(h) + '</th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((row) => '<tr>' + header.map((h, idx) =>
            '<td style="text-align:' + (aligns[idx] || 'left') + '">' + inlineMd(row[idx] || '') + '</td>').join('') + '</tr>').join('') +
          '</tbody></table>';
        continue;
      }

      const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
      const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
      if (bullet || numbered) {
        flushParagraph();
        flushQuote();
        const rawIndent = (bullet || numbered)[1].replace(/\t/g, '  ').length;
        const level = Math.min(3, Math.floor(rawIndent / 2));
        if (numbered) {
          if (listItems.length && !listItems[0].ordered && level === 0) flushList();
          listItems.push({ level, ordered: true, text: numbered[3] });
        } else {
          if (listItems.length && listItems[0].ordered && level === 0) flushList();
          listItems.push({ level, ordered: false, text: bullet[2] });
        }
        i++;
        continue;
      }

      if (listItems.length) flushList();
      if (quote.length) flushQuote();
      paragraph.push(trimmed);
      i++;
    }
    flushAll();

    html = html.replace(/\u0000CODE(\d+)\u0000/g, (m, idx) => {
      const block = blocks[+idx];
      return block ? codeBlockHtml(block.lang, block.code) : '';
    });

    return html || '<p></p>';
  }

  function closeOpenFence(text) {
    const count = (String(text).match(/```/g) || []).length;
    return count % 2 === 1 ? text + '\n```' : text;
  }

  /* ----------------------------------------------------------
     8. small analysis utilities
     ---------------------------------------------------------- */
  function calc(expression) {
    const s = String(expression).replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
    let i = 0;
    const peek = () => s[i];
    function atom() {
      if (peek() === '(') {
        i++;
        const v = expr();
        if (s[i] !== ')') throw new Error('Missing )');
        i++;
        return v;
      }
      const start = i;
      while (i < s.length && /[\d.]/.test(s[i])) i++;
      if (start === i) throw new Error('Unexpected token');
      const n = Number(s.slice(start, i));
      if (!isFinite(n)) throw new Error('Bad number');
      return n;
    }
    function power() {
      let base = atom();
      if (peek() === '^') {
        i++;
        base = Math.pow(base, unary());
      }
      return base;
    }
    function unary() {
      if (peek() === '-' || peek() === '+') {
        const op = s[i];
        i++;
        const v = unary();
        return op === '-' ? -v : v;
      }
      return power();
    }
    function term() {
      let v = unary();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = s[i];
        i++;
        const r = unary();
        if (op === '*') v *= r;
        else if (op === '/') {
          if (r === 0) throw new Error('Division by zero');
          v /= r;
        } else v %= r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = s[i];
        i++;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const value = expr();
    if (i < s.length) throw new Error('Unexpected input');
    return value;
  }

  function extractMath(raw) {
    let t = String(raw).trim().replace(/[?？]+$/, '');
    t = t.replace(/×/g, '*').replace(/÷/g, '/');
    t = t.replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-')
      .replace(/\btimes\b/gi, '*').replace(/\bmultiplied by\b/gi, '*')
      .replace(/\bdivided by\b/gi, '/');
    t = t.replace(/^(what(?:'s| is)|calculate|compute|solve|evaluate|how much is|whats)\s+/i, '');
    t = t.replace(/\s*=\s*$/, '');
    if (!/\d/.test(t)) return null;
    if (!/[+\-*/%^]/.test(t)) return null;
    if (!/^[\d\s.+\-*/%^()]+$/.test(t)) return null;
    return t;
  }

  function formatNumber(n) {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n) && Math.abs(n) < 1e15) {
      try { return n.toLocaleString('en-US'); } catch (e) { return String(n); }
    }
    return String(Math.round(n * 1e10) / 1e10);
  }

  function summarise(source) {
    const text = String(source).replace(/\s+/g, ' ').trim();
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const stop = new Set(('the a an and or but if then than that this these those is are was were be been being to of in on for with as at by from it its you your we our they their he she his her i me my not no do does did have has had will would can could should about into over under more most such very just so also there what when where which who whom why how').split(' '));
    const freq = {};
    const words = text.toLowerCase().match(/[a-z']+/g) || [];
    words.forEach((w) => {
      if (w.length > 2 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    const scored = sentences.map((sentence, idx) => {
      const ws = sentence.toLowerCase().match(/[a-z']+/g) || [];
      let score = 0;
      ws.forEach((w) => { score += freq[w] || 0; });
      return { sentence: sentence.trim(), idx, score: score / Math.max(1, Math.sqrt(ws.length)) };
    });
    const top = scored.slice().sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.idx - b.idx);
    return {
      summary: top.map((t) => t.sentence).join(' '),
      words: (text.match(/\S+/g) || []).length
    };
  }

  /* ----------------------------------------------------------
     9. built-in engine — content
     ---------------------------------------------------------- */
  const KNOWLEDGE = [
    {
      test: /\bhttps?\b|tls|ssl|certificate/,
      text: function () {
        return [
          '**HTTPS is HTTP wearing a security jacket.** The page and the requests work the same — HTTPS wraps the conversation in encryption and proves who you are talking to.',
          '',
          '**Like you are five:** a normal HTTP request is a postcard anyone along the way can read. HTTPS puts the postcard in a locked box, checks your friend\'s ID before handing it over, and gives you a receipt if anyone tampered with it.',
          '',
          '**What actually happens:**',
          '1. **Handshake.** Your browser lists the encryption it supports. The server replies with its **certificate**, containing its public key, signed by a certificate authority the browser already trusts.',
          '2. **Verify.** The browser checks the signature, the domain name, and the expiry date. Wrong or missing certificate → a full-page warning.',
          '3. **Key exchange.** Browser and server derive a shared **session key**. Modern TLS uses ephemeral Diffie-Hellman, so the key itself is never sent.',
          '4. **Encrypted traffic.** Every HTTP request and response is encrypted and integrity-checked with that session key.',
          '',
          '**What the padlock guarantees:** the traffic is encrypted, and a trusted CA vouched for that domain. It does **not** mean the site is honest or safe — phishing sites can have valid certificates too.',
          '',
          '*Technical summary: HTTP/1.1 or HTTP/2 over TLS 1.2/1.3 on port 443. HSTS makes browsers refuse plain HTTP for that domain, and TLS 1.3 cuts the handshake to one round trip.*'
        ].join('\n');
      }
    },
    {
      test: /\bdns\b|domain name system/,
      text: function () {
        return [
          '**DNS is the internet\'s phone book.** Humans use names like example.com; computers route packets with IP addresses. DNS translates one into the other.',
          '',
          '1. The browser checks its cache, then asks your **recursive resolver** (usually your ISP or 1.1.1.1).',
          '2. The resolver asks a **root server**, which points at the right top-level domain (.com).',
          '3. The TLD server points at the domain\'s **authoritative nameserver**.',
          '4. That server returns the record — usually an **A** (IPv4) or **AAAA** (IPv6) record. The resolver caches it for the record\'s TTL.',
          '',
          '**Record types worth knowing:** A/AAAA (address), CNAME (alias), MX (mail), TXT (verification, SPF/DKIM), NS (nameserver), SRV (service).',
          '',
          'DNS is normally unencrypted and easy to spoof, which is why **DNSSEC** adds integrity and **DoH / DoT** encrypt queries.'
        ].join('\n');
      }
    },
    {
      test: /\brecursion\b|recursive function/,
      text: function () {
        return [
          '**Recursion** is a function that solves a problem by calling itself on a smaller version of the same problem — plus a **base case** that stops the chain.',
          '',
          FENCE + 'js\nfunction factorial(n) {\n  if (n <= 1) return 1;       // base case\n  return n * factorial(n - 1); // smaller sub-problem\n}\n' + FENCE,
          '',
          '**The two rules:** every call must move toward the base case, and the base case must actually return. Forget either one and you get a stack overflow.',
          '',
          '**Good fit:** trees, graphs, divide-and-conquer (merge sort, quicksort), parsing nested structures, backtracking.',
          '**Loop instead:** simple numeric accumulation — recursion costs a stack frame per call and is usually slower in JavaScript.',
          '',
          '**Debugging tip:** print the arguments and indent by depth. If the arguments do not shrink, you have found the bug.'
        ].join('\n');
      }
    },
    {
      test: /\bclosures?\b/,
      text: function () {
        return [
          '**A closure is a function plus the variables it captured from where it was created** — even after that outer function has returned.',
          '',
          FENCE + 'js\nfunction counter() {\n  let count = 0;\n  return function () {\n    count += 1;\n    return count;\n  };\n}\n\nconst next = counter();\nnext(); // 1\nnext(); // 2\n' + FENCE,
          '',
          'count is not global and not recreated — each call to counter() gets its own private count. That is how modules, memoisation, debounce, and React hooks keep state without globals.',
          '',
          '**Gotcha:** a closure keeps its captured variables alive, so a long-lived callback holding a big object prevents garbage collection. In loops, use let (block scope) rather than var so each iteration captures its own binding.'
        ].join('\n');
      }
    },
    {
      test: /\bmachine learning\b|\bml\b|neural network|deep learning/,
      text: function () {
        return [
          '**Machine learning** is fitting a function to examples instead of writing rules by hand.',
          '',
          '**The three families:**',
          '- **Supervised** — labelled examples, learn input → output (spam detection, price prediction).',
          '- **Unsupervised** — no labels, find structure (clustering, dimensionality reduction).',
          '- **Reinforcement** — an agent acts, gets rewards, improves a policy (games, robotics).',
          '',
          '**A neural network** is layers of weighted sums plus a non-linearity. Training repeats: forward pass → loss → backpropagate gradients → nudge weights with an optimiser such as Adam.',
          '',
          '**The part people underestimate:** data quality, splits that prevent leakage, and evaluation. A model scoring 99% on data it has seen and 60% in production is not a good model — it is a memoriser.',
          '',
          '**Practical starting point:** scikit-learn on tabular data before reaching for a neural network. Most tabular problems are won by gradient-boosted trees.'
        ].join('\n');
      }
    },
    {
      test: /blockchain|crypto(currency)?|bitcoin/,
      text: function () {
        return [
          '**A blockchain is an append-only ledger replicated across many machines**, where each block contains a hash of the previous one — so changing history means recomputing every later block.',
          '',
          '**How a transaction lands:**',
          '1. You sign a transaction with your private key and broadcast it.',
          '2. It waits in a mempool until a validator includes it in a block.',
          '3. Nodes check the signature, balances, and consensus rules, then accept the block.',
          '4. Consensus (proof of work or proof of stake) decides which chain is canonical.',
          '',
          '**Genuinely good for:** settlement without a trusted intermediary, auditable provenance, and assets that must not be double-spent.',
          '**Bad at:** privacy by default, throughput, cost, and undo. "On-chain" is not a synonym for "correct" — bugs in contracts are permanent too.',
          '',
          '**Security rule:** never share a seed phrase. No legitimate support person will ever ask for it.'
        ].join('\n');
      }
    },
    {
      test: /\bdocker\b|container/,
      text: function () {
        return [
          '**Docker packages an application with its dependencies into an image**, and runs that image as an isolated container sharing the host kernel.',
          '',
          '**Mental model:** image = read-only recipe, container = running instance, volume = persistent data, network = private DNS between containers.',
          '',
          FENCE + 'dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nENV NODE_ENV=production\nEXPOSE 3000\nCMD ["node", "server.js"]\n' + FENCE,
          '',
          'Copy the lockfile first so dependency layers cache; copy source last so code edits do not reinstall everything. Add a .dockerignore with node_modules, .git and .env.',
          '',
          '**Containers are not VMs:** they share the kernel, start in milliseconds, and are not as strong a security boundary as a hypervisor.'
        ].join('\n');
      }
    },
    {
      test: /\bgit\b|version control/,
      text: function () {
        return [
          '**Git is a content-addressed history of snapshots.** A commit points at a tree of files and at its parent commit; branches are just movable labels.',
          '',
          '**Undo, by situation:**',
          '- Wrong message on the last commit → git commit --amend',
          '- Unstage a file → git restore --staged file',
          '- Throw away local edits → git restore file',
          '- Undo last commit but keep changes → git reset --soft HEAD~1',
          '- Undo a pushed commit safely → git revert <sha>',
          '- Recover a lost commit → git reflog, then reset to the sha',
          '',
          '**Rule of thumb:** rebase your own unpushed work, revert anything already shared. Never force-push a branch other people are building on.',
          '',
          'Ask me for the full git cheat sheet and I will show the everyday loop too.'
        ].join('\n');
      }
    },
    {
      test: /quantum comput/,
      text: function () {
        return [
          '**A quantum computer manipulates qubits, which can be in a superposition of 0 and 1 and can be entangled with each other.**',
          '',
          '**Why that matters:** n qubits describe a state with 2^n amplitudes, and a circuit evolves all of them at once. For a few specific problems — factoring (Shor), unstructured search (Grover), simulating molecules — that gives a real asymptotic advantage.',
          '',
          '**Why it is not a fast PC:** measurement collapses the state to one outcome, so you only get one answer. Algorithms must arrange interference so wrong answers cancel and the right one is likely. Most everyday work has no known quantum speed-up.',
          '',
          '**Where it stands:** small, noisy devices exist; error correction needs many physical qubits per logical qubit. Practical, large-scale advantage is still an engineering problem, not a shipping product.'
        ].join('\n');
      }
    }
  ];

  const CODE_KB = [
    {
      test: function (q) { return /python/.test(q) && /renam|lowercase|lower case/.test(q); },
      lang: 'python',
      intro: 'Here is a safe version — it previews by default, only renames when you switch the dry-run flag off, skips collisions, and ignores directories.',
      code: [
        'from pathlib import Path',
        'import argparse',
        '',
        '',
        'def rename_files(folder: Path, dry_run: bool) -> None:',
        '    changed = 0',
        '    for path in sorted(folder.iterdir()):',
        '        if not path.is_file():',
        '            continue',
        '',
        '        new_name = path.name.lower()',
        '        if new_name == path.name:',
        '            continue',
        '',
        '        target = path.with_name(new_name)',
        '        if target.exists():',
        '            print("skip (already exists):", path.name)',
        '            continue',
        '',
        '        action = "would rename" if dry_run else "renaming"',
        '        print(action, path.name, "->", new_name)',
        '        if not dry_run:',
        '            path.rename(target)',
        '        changed += 1',
        '',
        '    print(f"done: {changed} file(s) affected")',
        '',
        '',
        'if __name__ == "__main__":',
        '    parser = argparse.ArgumentParser(description="Lowercase every filename in a folder.")',
        '    parser.add_argument("folder", nargs="?", default=".", help="folder to scan")',
        '    parser.add_argument("--dry-run", action="store_true", help="preview changes only")',
        '    args = parser.parse_args()',
        '',
        '    rename_files(Path(args.folder), args.dry_run)'
      ].join('\n'),
      note: [
        '**Run it:**',
        '- Preview: python rename.py ./photos --dry-run',
        '- Apply: python rename.py ./photos',
        '',
        '**Why it is written this way:** it ignores directories, skips names that would collide (important on case-insensitive filesystems such as macOS and Windows), and prints every action. If you also want to strip spaces or accents, change **new_name** before the collision check.'
      ].join('\n')
    },
    {
      test: function (q) { return /reverse/.test(q) && /string/.test(q); },
      lang: 'js',
      intro: 'Spread the string so emoji and accented characters survive, then reverse and join.',
      code: 'function reverseString(value) {\n  return [...value].reverse().join("");\n}\n\nconsole.log(reverseString("hello")); // "olleh"\nconsole.log(reverseString("a👍b"));  // "b👍a"',
      note: 'Avoid str.split("") on text that may contain emoji or combining marks — it splits surrogate pairs. The spread operator iterates by code point instead.'
    },
    {
      test: function (q) { return /fizz\s?buzz/.test(q); },
      lang: 'js',
      intro: 'The version interviewers actually want: one loop, no duplicated modulo logic, and it returns a value you can test.',
      code: 'function fizzbuzz(n = 100) {\n  const out = [];\n  for (let i = 1; i <= n; i++) {\n    let word = "";\n    if (i % 3 === 0) word += "Fizz";\n    if (i % 5 === 0) word += "Buzz";\n    out.push(word || String(i));\n  }\n  return out;\n}\n\nconsole.log(fizzbuzz(15).join(" "));',
      note: 'Appending both words in order handles 15 correctly without a special case. Return the array so it is testable; log at the edge.'
    },
    {
      test: function (q) { return /fibonacci|fib\(/.test(q); },
      lang: 'js',
      intro: 'Iterative Fibonacci: O(n) time, O(1) memory, no stack overflow.',
      code: 'function fib(n) {\n  let a = 0;\n  let b = 1;\n  for (let i = 0; i < n; i++) {\n    [a, b] = [b, a + b];\n  }\n  return a;\n}\n\nconsole.log(fib(10)); // 55',
      note: 'The naive recursive version is O(2^n) and blows the stack around n = 40. If you need many values, memoise or return the whole sequence.'
    },
    {
      test: function (q) { return /debounce/.test(q); },
      lang: 'js',
      intro: 'A debounce that keeps the latest arguments and preserves this.',
      code: 'function debounce(fn, wait = 300) {\n  let timer = null;\n  return function debounced(...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), wait);\n  };\n}\n\nconst onSearch = debounce((term) => {\n  console.log("searching for", term);\n}, 400);',
      note: 'Add debounced.cancel = () => clearTimeout(timer) if you need to cancel on unmount. For "run at most once per interval" you want throttle, not debounce.'
    },
    {
      test: function (q) { return /fetch|http request|api call/.test(q); },
      lang: 'js',
      intro: 'A fetch wrapper that fails loudly instead of silently handing you an error page.',
      code: 'async function getJSON(url, options = {}) {\n  const res = await fetch(url, {\n    ...options,\n    headers: { Accept: "application/json", ...(options.headers || {}) },\n  });\n\n  if (!res.ok) {\n    const detail = await res.text().catch(() => "");\n    throw new Error("HTTP " + res.status + " " + detail.slice(0, 200));\n  }\n\n  return res.json();\n}\n\nconst users = await getJSON("https://api.example.com/users");',
      note: 'fetch only rejects on network failure — a 404 or 500 resolves normally, which is why the res.ok check matters. Add signal: controller.signal for cancellation and a timeout.'
    },
    {
      test: function (q) { return /sort/.test(q) && /array|object|people|list/.test(q); },
      lang: 'js',
      intro: 'Sorting objects by a field, without mutating the original array.',
      code: 'const people = [\n  { name: "Ada", age: 36 },\n  { name: "Grace", age: 43 },\n  { name: "Alan", age: 28 },\n];\n\nconst byAge = [...people].sort((a, b) => a.age - b.age);\nconst byName = [...people].sort((a, b) => a.name.localeCompare(b.name));',
      note: 'The default sort() compares strings, so [10, 9, 1].sort() gives [1, 10, 9]. Always pass a comparator for numbers, and use localeCompare for human-readable names.'
    },
    {
      test: function (q) { return /palindrome/.test(q); },
      lang: 'js',
      intro: 'A palindrome check that ignores case, spaces, and punctuation.',
      code: 'function isPalindrome(value) {\n  const clean = String(value).toLowerCase().replace(/[^a-z0-9]/g, "");\n  return clean === [...clean].reverse().join("");\n}\n\nconsole.log(isPalindrome("A man, a plan, a canal: Panama")); // true',
      note: 'For very long strings, compare from both ends with two pointers and skip early — O(n) time, O(1) extra space, versus O(n) extra here.'
    },
    {
      test: function (q) { return /binary search/.test(q); },
      lang: 'js',
      intro: 'Binary search on a sorted array, returning the index or -1.',
      code: 'function binarySearch(sorted, target) {\n  let low = 0;\n  let high = sorted.length - 1;\n\n  while (low <= high) {\n    const mid = (low + high) >> 1;\n    if (sorted[mid] === target) return mid;\n    if (sorted[mid] < target) low = mid + 1;\n    else high = mid - 1;\n  }\n\n  return -1;\n}\n\nconsole.log(binarySearch([1, 4, 9, 12, 30], 12)); // 3',
      note: 'The <= in the loop condition and the mid + 1 / mid - 1 updates are what make it terminate. Getting either wrong is the classic infinite loop.'
    },
    {
      test: function (q) { return /react/.test(q) && /counter|state/.test(q); },
      lang: 'jsx',
      intro: 'A minimal React counter using the functional state update so rapid clicks never drop an increment.',
      code: 'import { useState } from "react";\n\nexport default function Counter() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount((c) => c + 1)}>\n        Add one\n      </button>\n      <button onClick={() => setCount(0)}>Reset</button>\n    </div>\n  );\n}',
      note: 'setCount(c => c + 1) uses the previous value. Calling setCount(count + 1) twice in one handler would only add one.'
    },
    {
      test: function (q) { return /express|node server|rest api/.test(q); },
      lang: 'js',
      intro: 'A small Express API with validation and a real 404.',
      code: 'import express from "express";\n\nconst app = express();\napp.use(express.json());\n\napp.get("/health", (req, res) => {\n  res.json({ ok: true, time: new Date().toISOString() });\n});\n\napp.post("/users", (req, res) => {\n  const { name } = req.body ?? {};\n  if (typeof name !== "string" || !name.trim()) {\n    return res.status(400).json({ error: "name is required" });\n  }\n  res.status(201).json({ id: crypto.randomUUID(), name: name.trim() });\n});\n\napp.use((req, res) => res.status(404).json({ error: "not found" }));\n\napp.listen(3000, () => console.log("http://localhost:3000"));',
      note: 'Keep validation at the edge, return proper status codes, and register the 404 handler last. In production put this behind HTTPS and a rate limiter.'
    },
    {
      test: function (q) { return /\bsql\b|database query/.test(q); },
      lang: 'sql',
      intro: 'A grouped join with a date filter and a sensible order.',
      code: 'SELECT\n  u.id,\n  u.name,\n  COUNT(o.id) AS order_count,\n  COALESCE(SUM(o.total), 0) AS lifetime_value\nFROM users u\nLEFT JOIN orders o\n  ON o.user_id = u.id\n AND o.created_at >= \'2026-01-01\'\nGROUP BY u.id, u.name\nORDER BY lifetime_value DESC\nLIMIT 20;',
      note: 'Putting the date in the JOIN keeps users with zero recent orders. In the WHERE clause it would silently turn the LEFT JOIN into an INNER JOIN.'
    },
    {
      test: function (q) { return /email/.test(q) && /regex|validate|validation/.test(q); },
      lang: 'js',
      intro: 'A pragmatic email check. Perfect validation is impossible in a regex — this catches typos, then you confirm by sending mail.',
      code: 'const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/;\n\nfunction looksLikeEmail(value) {\n  return EMAIL_RE.test(String(value).trim());\n}\n\nconsole.log(looksLikeEmail("ada@example.com")); // true\nconsole.log(looksLikeEmail("ada@example"));     // false',
      note: 'Do not try to implement RFC 5322 in a regex. Check shape, normalise the domain, and verify with a confirmation email.'
    },
    {
      test: function (q) { return /center/.test(q) && /div|element|css/.test(q); },
      lang: 'css',
      intro: 'The two modern answers. Grid is the shortest; flex is the most compatible.',
      code: '.parent {\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}\n\n/* or */\n\n.parent {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n}',
      note: 'For absolutely positioned children, inset: 0 with margin: auto and a fixed width/height also works. Avoid margin: auto alone on a block without a width — it will not centre horizontally.'
    },
    {
      test: function (q) { return /git/.test(q) && /undo|revert|reset|amend/.test(q); },
      lang: 'bash',
      intro: 'Pick the command by what you are trying to undo.',
      code: 'git restore --staged file.js      # unstage, keep edits\ngit restore file.js               # discard local edits\ngit commit --amend --no-edit      # change the last commit\ngit reset --soft HEAD~1           # undo last commit, keep changes staged\ngit revert <sha>                  # safely undo a pushed commit\ngit reflog                        # find a lost commit',
      note: 'reset --hard is the one that destroys work. Before any history rewrite, run git branch backup so there is a way back.'
    }
  ];

  function knowledgeAnswer(q) {
    for (let i = 0; i < KNOWLEDGE.length; i++) {
      if (KNOWLEDGE[i].test.test(q)) return KNOWLEDGE[i].text();
    }
    return null;
  }

  function emailAnswer(raw) {
    const formal = /formal|professional|boss|manager/.test(raw.toLowerCase());
    const short = /short|brief|quick/.test(raw.toLowerCase());
    return [
      '**Subject:** Quick check-in on the proposal',
      '',
      'Hi [Name],',
      '',
      'I wanted to follow up on the proposal I sent last week — I know inboxes get busy, so no pressure at all.',
      '',
      short
        ? 'If it is easier, I can summarise the two key points in three lines, or we can do a 15-minute call.'
        : 'Happy to walk you through the key points in 15 minutes, or adjust anything that did not quite fit what you had in mind.',
      '',
      'Is there a better time next week for a quick call?',
      '',
      formal ? 'Kind regards,' : 'Best,',
      '[Your name]',
      '',
      '---',
      '',
      '**Why this works:** it is short, it gives them an easy out, it offers a concrete next step, and it does not guilt them for being late. Swap the bracketed parts, delete the line that does not fit, and send.',
      '',
      'Want it warmer, more formal, or under 60 words? Tell me which and I will rewrite it.'
    ].join('\n');
  }

  function lisbonPlan() {
    return [
      '**Lisbon in 3 days — under 8 km of walking a day**',
      '',
      'Stay in **Baixa or Chiado**: central, flat, and most of the city is downhill from there. Lisbon is hills plus cobbles, so plan downhill and take tram or metro back up. A rechargeable Viva Viagem card costs €0.50, then €1.85 per trip.',
      '',
      '| Day | Morning | Afternoon | Evening | Walking |',
      '| --- | --- | --- | --- | --- |',
      '| 1 | Praça do Comércio → Rua Augusta → Augusta Arch | Castelo de São Jorge (bus 737 up, walk down through Alfama) | Sunset at Miradouro da Senhora do Monte, dinner in Alfama | ~6 km |',
      '| 2 | Belém: Jerónimos Monastery (book the first slot) | Pastéis de Belém, Monument to the Discoveries, Tower of Belém | Train to Cascais, or a relaxed dinner in Cais do Sodré | ~5 km |',
      '| 3 | LX Factory market (Sunday) or the MAAT museum | Time Out Market for lunch, then Chiado bookshops | Fado in Mouraria, or drinks at Park bar | ~5 km |',
      '',
      '**Budget per person (mid-range, excluding flights)**',
      '',
      '| Item | Per day | 3 days |',
      '| --- | --- | --- |',
      '| Central 3-star or good guesthouse | €95–130 | €285–390 |',
      '| Food (coffee and pastry, one sit-down meal) | €35–55 | €105–165 |',
      '| Transport and entries | €15–25 | €45–75 |',
      '| **Total** | **€145–210** | **€435–630** |',
      '',
      '**Keep the walking down:**',
      '- Take tram 28 or the metro for the uphill legs, not the scenic route.',
      '- Wear shoes with actual grip — the calçada is slippery when dry and lethal when wet.',
      '- Book Jerónimos and the Tower in advance; the queue is the real distance.',
      '',
      '**One swap if you want nature:** replace day 3 with Sintra (40 minutes by train, €2.30). Pick either Quinta da Regaleira or Pena Palace — both in one day is a 12 km hike.'
    ].join('\n');
  }

  function genericPlan(topic) {
    return [
      '**' + (topic || 'Your plan') + ' — a focused 3-day outline**',
      '',
      'The structure matters more than the exact hours: one theme per day, one anchor booking, and slack in the afternoon.',
      '',
      '| Day | Morning | Afternoon | Evening |',
      '| --- | --- | --- | --- |',
      '| 1 | Orient yourself: one landmark, one neighbourhood | The main thing you came for | Low-key dinner near where you are staying |',
      '| 2 | Booked anchor activity, start early | Second-tier sights or a long walk | Something local, not tourist-facing |',
      '| 3 | Market, museum, or a day trip | Buffer, shopping, rest | Pack, then one last good meal |',
      '',
      '**Budget rule of thumb:** 40% accommodation, 30% food, 20% transport and entries, 10% buffer. Put the buffer in writing or it disappears.',
      '',
      '**Two rules that save trips:** book only the things that sell out, and never schedule two timed activities in one afternoon.',
      '',
      'Tell me the city, dates, budget and how much walking you want, and I will turn this into a real itinerary.'
    ].join('\n');
  }

  function fallbackAnswer(raw) {
    const topic = raw
      .replace(/^(please\s+)?(can you\s+|could you\s+)?(help me\s+)?/i, '')
      .replace(/[?.!]+$/, '')
      .trim()
      .slice(0, 120) || 'that';
    return [
      '**Let us take "' + topic + '" apart.**',
      '',
      '1. **Define the outcome.** Write the one sentence that would make this "done". If you cannot, the task is still a feeling, not a task.',
      '2. **List the constraints.** Time, money, skill, tools, other people. Constraints are what turn advice into an answer.',
      '3. **Build the smallest version.** One sentence, one function, one page. Something you can look at today.',
      '4. **Check it against reality.** Show it to one person, run it once, read it out loud. Revise from the reaction, not from imagination.',
      '',
      'Give me the specifics — language, audience, budget, deadline, whatever applies — and I will make this concrete instead of abstract.',
      '',
      '*I am Wavey Local, the built-in engine: strongest on structure, code patterns, math, and writing templates. For open-ended factual questions, connect a model in Settings → Model and this same window becomes a full LLM.*'
    ].join('\n');
  }

  /* ----------------------------------------------------------
     10. built-in engine — reply selection
     ---------------------------------------------------------- */
  function localReply(conv) {
    const history = conv.messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content));
    const lastUser = history.slice().reverse().find((m) => m.role === 'user');
    if (!lastUser) return 'Ask me anything — I am right here.';
    const raw = String(lastUser.content || '').trim();
    const q = raw.toLowerCase();
    const attachments = lastUser.attachments || [];
    const textFile = attachments.find((a) => a.kind === 'text');
    const images = attachments.filter((a) => a.kind === 'image');

    if (!raw && attachments.length) {
      if (images.length && !textFile) {
        return 'I can see ' + (images.length === 1 ? 'an image is' : images.length + ' images are') + ' attached, but the built-in engine cannot look at pictures.\n\n' +
          '**Two options:**\n- Describe what matters in text and I will work with that.\n- Connect a vision-capable model in **Settings → Model** (for example gpt-4o) and resend — the attachment goes with the message.';
      }
      if (textFile && !images.length) {
        const words = (textFile.text.match(/\S+/g) || []).length;
        return 'Got **' + textFile.name + '** (' + words + ' words).\n\n' +
          '**What I can do with it right now:**\n- Summarise it — ask "summarise the file".\n- Count words or characters.\n- Pull the first lines or find a phrase.\n\n' +
          'For a deeper reading, connect a cloud model in Settings → Model; text attachments are included automatically.';
      }
    }

    if (/summari[sz]e|tl;?dr|shorten/.test(q)) {
      const source = (textFile && textFile.text) || '';
      if (source.trim().length > 120) {
        const result = summarise(source);
        return '**Summary of ' + textFile.name + '** (' + result.words + ' words in, ' + (result.summary.match(/\S+/g) || []).length + ' out)\n\n' +
          result.summary + '\n\n*Extractive summary — it keeps the author\'s sentences rather than rewriting them. Ask for a bullet version or a stricter length if you want.*';
      }
      const pasted = raw.split(/[:：]/).slice(1).join(':').trim();
      if (pasted.length > 120) {
        const result = summarise(pasted);
        return '**Summary** (' + result.words + ' words in)\n\n' + result.summary;
      }
      return 'Paste the text you want summarised, or attach a .txt or .md file and ask again. I keep the key sentences and tell you how much I compressed.';
    }

    if (/python/.test(q) && /renam|lowercase|lower case/.test(q)) {
      const entry = CODE_KB[0];
      return entry.intro + '\n\n' + FENCE + entry.lang + '\n' + entry.code + '\n' + FENCE + '\n\n' + entry.note;
    }

    if (/\bhttps?\b|tls|ssl/.test(q)) {
      const answer = knowledgeAnswer(q);
      if (answer) return answer;
    }

    if (!raw && !attachments.length) return 'I did not catch that — try typing a question.';

    if (/^(hi|hey|hello|yo|hiya|sup|howdy|good (morning|afternoon|evening))\b[\s!.,]*$/.test(q)) {
      const name = (state.settings.name || '').trim();
      return 'Hey' + (name ? ' ' + name : '') + '! What are we working on?\n\nA few things I am good at: explaining code, writing a draft, doing math, planning something, or debugging a problem.';
    }

    if (/^(thanks|thank you|thx|ty|cheers|nice|great|perfect)\b/.test(q)) {
      return 'Anytime. Want to keep going, or start something new?';
    }

    if (/^(bye|goodbye|see you|good night|later)\b/.test(q)) {
      return 'See you. Your chats are saved in this browser, so pick up wherever you left off.';
    }

    if (/(who|what) (are|r) you|your name|what model|are you (chatgpt|gpt|openai|claude)/.test(q)) {
      const cloud = state.settings.provider === 'openai' && state.settings.apiKey.trim();
      return cloud
        ? 'I am **Wavey AI**, currently talking to **' + state.settings.model + '** through the endpoint in Settings. The interface, history and shortcuts are mine; the words come from that model.'
        : 'I am **Wavey AI**. Right now you are talking to **Wavey Local** — the built-in engine that ships inside this page. No account, no network, no key.\n\nIt is genuinely useful for code snippets, math, structure, summaries and drafts, but it is not a general-purpose LLM. If you want full GPT answers, open **Settings → Model**, paste a key, and the same chat switches over.';
    }

    if (/what can you do|capabilit|features|how do you work|what do you do/.test(q)) {
      return [
        '**What works right now, with no setup:**',
        '- Markdown answers, syntax-highlighted code, copy buttons',
        '- Conversation history, search, pin, rename, export, import',
        '- Image and text-file attachments, drag and drop, paste',
        '- Voice dictation and read-aloud (browser support varies)',
        '- Math, dates, summaries, writing templates, plans, debugging checklists',
        '',
        '**What needs a key:** open-ended factual questions and real reasoning, via any OpenAI-compatible endpoint. **Settings → Model** takes a base URL, key and model id — OpenRouter, Groq, Together, LM Studio and Ollama all work.',
        '',
        'Ask for a code snippet, a draft, a plan or a calculation and you will see the local engine work immediately.'
      ].join('\n');
    }

    if (/^how are you/.test(q)) return 'Running fine — no servers involved. What can I help with?';

    if (/what.*(time|date|day).*(is it|now|today)|what('s| is) the (time|date)/.test(q)) {
      const now = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      let zone = '';
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { zone = ''; }
      return 'It is **' + time + '** on **' + date + '**' + (zone ? ' (' + zone + ')' : '') + ', according to this device.';
    }

    const mathExpression = extractMath(raw);
    if (mathExpression) {
      try {
        const value = calc(mathExpression);
        return '**' + mathExpression.replace(/\*/g, '×').replace(/\//g, '÷') + ' = ' + formatNumber(value) + '**\n\n' +
          'Calculated with the built-in parser — it handles brackets, powers and the % operator.\n\n' +
          'If you meant something else (a percentage of a number, a unit conversion, a formula), say it in words and I will set it up.';
      } catch (e) {
        return 'I read that as arithmetic but could not parse it: **' + mathExpression + '**.\n\nUse digits, brackets and the operators + - * / % ^. For example: (1200 * 1.2) / 3.';
      }
    }

    if (/count (the )?words|word count|how many words/.test(q)) {
      const source = (textFile && textFile.text) || raw.split(/[:：]/).slice(1).join(':') || '';
      const words = (source.match(/\S+/g) || []).length;
      if (!words) return 'Paste the text after a colon and I will count it — e.g. "count the words: your text here".';
      return '**' + words.toLocaleString() + ' words · ' + source.length.toLocaleString() + ' characters**\n\nReading time at 220 wpm: about ' + Math.max(1, Math.round(words / 220)) + ' minute(s).';
    }

    if (/(write|draft|compose|reply|follow.?up)/.test(q) && /(email|e-mail|message|note|reply)/.test(q)) {
      return emailAnswer(raw);
    }

    if (/lisbon/.test(q) && /(plan|trip|days|itinerary)/.test(q)) return lisbonPlan();

    if (/(plan|itinerary|schedule|roadmap|study plan|workout)/.test(q) && /(make|create|give|need|build|plan|design)/.test(q)) {
      return genericPlan(raw.replace(/^(please\s+)?(can you\s+)?(make|create|give me|plan|design)\s+(me\s+)?(a\s+)?/i, '').replace(/[?.!]+$/, ''));
    }

    for (let i = 1; i < CODE_KB.length; i++) {
      if (CODE_KB[i].test(q)) {
        const entry = CODE_KB[i];
        return entry.intro + '\n\n' + FENCE + entry.lang + '\n' + entry.code + '\n' + FENCE + '\n\n' + entry.note;
      }
    }

    const knowledge = knowledgeAnswer(q);
    if (knowledge) return knowledge;

    if (/^(explain|what is|what are|how does|how do|why does|why do|define|tell me about)\b/.test(q)) {
      const topic = raw.replace(/^(please\s+)?(explain|what is|what are|how does|how do i|how do|why does|why do|define|tell me about)\s+/i, '').replace(/[?.!]+$/, '');
      return [
        '**' + topic + ' — a way in**',
        '',
        'I do not have reliable encyclopaedic knowledge in the built-in engine, so I will not invent facts. Here is how to get a solid answer fast:',
        '',
        '1. **Write the one-sentence version** you could say to a colleague. If you cannot, the gap is vocabulary, not depth.',
        '2. **Find the mechanism.** What causes what? Most explanations fail because they list features instead of a causal chain.',
        '3. **Find the boundary.** When does it not apply, and what is the alternative? That is where understanding shows.',
        '4. **Test it on one concrete example**, ideally one you already know.',
        '',
        'For the factual depth, connect a model in **Settings → Model** — the question and this conversation carry straight over, and the interface stays exactly the same.',
        '',
        '*If you were asking about HTTPS, DNS, recursion, closures, git, Docker, machine learning, blockchain or quantum computing, ask again with one of those words — those have real built-in answers.*'
      ].join('\n');
    }

    if (/\b(error|bug|fix|broken|not working|debug|exception|crash|undefined|null)\b/.test(q)) {
      return [
        '**Debug it in this order — resist changing code until step 3.**',
        '',
        '1. **Reproduce it exactly.** Smallest input, every time. If it is intermittent, the variable is time, concurrency, or data.',
        '2. **Read the whole error.** First line and the first frame in your code. The line number is a fact; your theory is not.',
        '3. **Bisect.** Comment out half. Does it still fail? Repeat. This beats staring at the code.',
        '4. **Check the boundaries.** Empty array, null, 0, one item, duplicate keys, undefined field, off-by-one.',
        '5. **Log the inputs, not the outputs.** The bug is almost always a value you assumed was something else.',
        '',
        'Paste the error text and the smallest code that reproduces it, and I will work through it with you. For language-specific fixes, a connected model will be faster.'
      ].join('\n');
    }

    if (/joke|funny/.test(q)) {
      return 'A SQL query walks into a bar, approaches two tables and asks: *"May I join you?"*\n\nWant a programming joke, a pun, or something genuinely good?';
    }

    if (/poem|haiku/.test(q)) {
      return '**Haiku for a late deploy**\n\nGreen tests in the dark —\nthe server hums its low song,\nMonday waits for logs.';
    }

    if (/motivat|inspir/.test(q)) {
      return 'Motivation is unreliable; systems are not.\n\nMake the next step so small it feels stupid — open the file, write one line, run one test. Momentum is easier to steer than to start.';
    }

    if (/\b(code|script|function|program|implement|snippet|component|class|algorithm)\b/.test(q)) {
      const topic = raw.replace(/[?.!]+$/, '').slice(0, 110);
      return [
        '**"' + topic + '"**',
        '',
        'I can write this, but the built-in engine only ships a fixed set of patterns — and I would rather not hand you a plausible-looking script that does not run.',
        '',
        '**What I need from you:** language and version, input shape, expected output, and one example. With that, connect a model in **Settings → Model** and ask again — code quality is the main thing the local engine cannot fake.',
        '',
        '**Meanwhile, these are built in:** reversing a string, FizzBuzz, Fibonacci, debounce, fetch with error handling, sorting objects, palindromes, binary search, a React counter, an Express route, grouped SQL, an email regex, centring a div, git undo, and a Python file-renaming script.',
        '',
        'Ask for one of those by name and you will get code immediately.'
      ].join('\n');
    }

    return fallbackAnswer(raw);
  }

  /* ----------------------------------------------------------
     11. cloud streaming
     ---------------------------------------------------------- */
  function hasKey() {
    return !!(state.settings.apiKey && state.settings.apiKey.trim());
  }

  function providerMode() {
    if (state.settings.provider === 'openai') return hasKey() ? 'openai' : 'openai-nokey';
    return 'local';
  }

  function apiMessages(conv) {
    const out = [];
    const system = (state.settings.systemPrompt || '').trim();
    out.push({
      role: 'system',
      content: (system ? system + '\n\n' : '') +
        'You are Wavey AI, a helpful assistant inside a single-page chat app. Use markdown. Be accurate and concise.'
    });
    const history = conv.messages
      .filter((m) => (m.content || (m.attachments && m.attachments.length)))
      .filter((m) => m.status !== 'error')
      .slice(-24);

    history.forEach((m) => {
      const textParts = [];
      if (m.content) textParts.push(m.content);
      (m.attachments || []).forEach((a) => {
        if (a.kind === 'text' && a.text) textParts.push('--- attached file: ' + a.name + ' ---\n' + a.text);
      });
      const images = (m.attachments || []).filter((a) => a.kind === 'image' && a.dataUrl);
      const text = textParts.join('\n\n');
      if (images.length) {
        const content = [{ type: 'text', text: text || 'Describe the attached image.' }];
        images.forEach((img) => content.push({ type: 'image_url', image_url: { url: img.dataUrl } }));
        out.push({ role: m.role, content });
      } else if (text) {
        out.push({ role: m.role, content: text });
      }
    });
    return out;
  }

  function apiUrl() {
    const base = (state.settings.baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
    return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  }

  function apiError(status, body) {
    let detail = '';
    try {
      const parsed = JSON.parse(body);
      detail = (parsed.error && parsed.error.message) || parsed.message || '';
    } catch (e) {
      detail = String(body || '').slice(0, 240);
    }
    const err = new Error(detail || 'Request failed');
    if (status === 401) { err.title = 'Invalid API key'; err.hint = 'The endpoint rejected the key. Check Settings → Model.'; }
    else if (status === 403) { err.title = 'Access denied'; err.hint = 'This key is not allowed to use that model.'; }
    else if (status === 404) { err.title = 'Endpoint or model not found'; err.hint = 'Check the base URL and the model id.'; }
    else if (status === 429) { err.title = 'Rate limit or quota reached'; err.hint = 'Wait a moment or check your provider dashboard.'; }
    else if (status >= 500) { err.title = 'Provider error ' + status; err.hint = 'The endpoint is having trouble. Try again shortly.'; }
    else { err.title = 'Request failed (' + status + ')'; err.hint = ''; }
    return err;
  }

  function friendlyError(err) {
    if (!err) return { title: 'Something went wrong', message: 'Unknown error.' };
    if (err.name === 'AbortError') return null;
    if (err.message === 'NOKEY') {
      return { title: 'No model connected', message: 'Wavey Local is ready to use. Add an API key in Settings → Model to send this request to GPT.' };
    }
    if (err.title) {
      return { title: err.title, message: String(err.message || '') + (err.hint ? ' ' + err.hint : '') };
    }
    const message = String(err.message || err);
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      return { title: 'Network error', message: 'Could not reach the endpoint. Check the base URL and your connection — some providers also block browser requests with CORS.' };
    }
    return { title: 'Something went wrong', message: message };
  }

  async function* streamOpenAI(conv, signal) {
    const settings = state.settings;
    const body = {
      model: settings.model || 'gpt-4o-mini',
      messages: apiMessages(conv),
      stream: !!settings.stream
    };
    if (!/^o\d/i.test(body.model)) body.temperature = Number(settings.temperature);

    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey.trim()
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw apiError(res.status, text);
    }

    if (!settings.stream) {
      const data = await res.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof content !== 'string') throw new Error('The endpoint returned an unexpected response shape.');
      yield content;
      return;
    }

    if (!res.body || !res.body.getReader) {
      const raw = await res.text();
      let content = raw;
      try {
        const parsed = JSON.parse(raw);
        content = parsed.choices[0].message.content;
      } catch (e) { /* keep raw */ }
      yield content;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '').trim();
        buffer = buffer.slice(newline + 1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let json;
        try {
          json = JSON.parse(payload);
        } catch (e) {
          continue;
        }
        if (json.error) throw new Error(json.error.message || 'The provider returned an error.');
        const choice = json.choices && json.choices[0];
        const delta = choice && choice.delta;
        if (delta && typeof delta.content === 'string' && delta.content) yield delta.content;
      }
    }
  }

  async function* streamLocal(conv, signal) {
    const reply = localReply(conv);
    if (!state.settings.stream) {
      await sleep(220, signal);
      yield reply;
      return;
    }
    await sleep(260 + Math.random() * 260, signal);
    const tokens = reply.match(/\S+\s*/g) || [reply];
    let buffer = '';
    for (let i = 0; i < tokens.length; i++) {
      if (signal.aborted) throw abortError();
      buffer += tokens[i];
      if (i % 2 === 1 || i === tokens.length - 1) {
        yield buffer;
        buffer = '';
        await sleep(8 + Math.random() * 18, signal);
      }
    }
    if (buffer) yield buffer;
  }

  /* ----------------------------------------------------------
     12. rendering
     ---------------------------------------------------------- */
  function getConv(id) {
    return state.conversations.find((c) => c.id === id) || null;
  }

  function getActive() {
    return getConv(state.activeId);
  }

  function createConversation() {
    const conv = {
      id: uid(),
      title: 'New chat',
      messages: [],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.conversations.unshift(conv);
    return conv;
  }

  function deriveTitle(text, attachments) {
    let title = String(text || '').replace(/\s+/g, ' ').trim();
    if (!title && attachments && attachments.length) title = attachments[0].name || 'New chat';
    if (title.length > 52) title = title.slice(0, 52).replace(/\s+\S*$/, '') + '…';
    return title || 'New chat';
  }

  function snippetOf(conv) {
    const last = conv.messages[conv.messages.length - 1];
    if (!last) return 'Empty chat';
    if (last.content) return stripForSnippet(last.content);
    if (last.attachments && last.attachments.length) return last.attachments[0].name;
    return 'Empty chat';
  }

  function groupOf(ts) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const then = new Date(ts);
    const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
    const diff = startToday - startThen;
    if (diff <= 0) return 'Today';
    if (diff === 86400000) return 'Yesterday';
    if (diff <= 6 * 86400000) return 'Previous 7 days';
    if (diff <= 29 * 86400000) return 'Previous 30 days';
    return 'Older';
  }

  function convItemHtml(conv) {
    const active = conv.id === state.activeId;
    const renaming = ui.renamingId === conv.id;
    const titleHtml = renaming
      ? '<input class="rename-input" style="padding:4px 6px;font-size:.84rem" value="' + escapeLight(conv.title) + '" aria-label="Chat name">'
      : '<span class="conv-title">' + escapeLight(conv.title) + '</span>';
    return '<div class="conv-item' + (active ? ' is-active' : '') + '" data-id="' + conv.id + '" role="button" tabindex="0">' +
      '<div class="conv-text">' + titleHtml + '<span class="conv-snippet">' + escapeLight(snippetOf(conv)) + '</span></div>' +
      (conv.pinned ? '<span class="conv-pin" title="Pinned"><svg class="ico"><use href="#i-pin"/></svg></span>' : '') +
      '<div class="conv-tools">' +
      '<button type="button" class="conv-tool" data-tool="pin" title="' + (conv.pinned ? 'Unpin' : 'Pin') + '" aria-label="' + (conv.pinned ? 'Unpin chat' : 'Pin chat') + '"><svg class="ico"><use href="#i-pin"/></svg></button>' +
      '<button type="button" class="conv-tool danger" data-tool="delete" title="Delete chat" aria-label="Delete chat"><svg class="ico"><use href="#i-trash"/></svg></button>' +
      '</div></div>';
  }

  function renderSidebar() {
    if (!el.conversationList) return;
    const query = ui.query.trim().toLowerCase();
    let list = state.conversations.slice();
    if (query) {
      list = list.filter((c) =>
        c.title.toLowerCase().includes(query) ||
        c.messages.some((m) => (m.content || '').toLowerCase().includes(query)) ||
        c.messages.some((m) => (m.attachments || []).some((a) => a.name.toLowerCase().includes(query)))
      );
    }

    const order = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];
    const groups = new Map();
    order.forEach((key) => groups.set(key, []));

    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
    list.forEach((conv) => {
      const key = conv.pinned ? 'Pinned' : groupOf(conv.updatedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(conv);
    });

    let html = '';
    groups.forEach((items, label) => {
      if (!items.length) return;
      html += '<div class="conv-group-title">' + label + '</div>';
      html += items.map(convItemHtml).join('');
    });
    el.conversationList.innerHTML = html;

    if (el.convEmpty) {
      el.convEmpty.hidden = list.length > 0;
      if (!list.length) {
        el.convEmpty.innerHTML = query
          ? 'No chats match “' + escapeLight(ui.query.trim()) + '”.'
          : 'No chats yet.<br><span>Start one below.</span>';
      }
    }
    if (el.searchClear) el.searchClear.hidden = !el.convSearch.value;

    if (ui.renamingId) {
      const input = el.conversationList.querySelector('.rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function actionButton(act, icon, label, extraClass) {
    return '<button type="button" class="msg-action' + (extraClass ? ' ' + extraClass : '') + '" data-act="' + act + '" title="' + label + '" aria-label="' + label + '">' +
      '<svg class="ico"><use href="#i-' + icon + '"/></svg></button>';
  }

  function attachmentHtml(a) {
    if (a.kind === 'image') {
      if (a.dataUrl) {
        return '<div class="attach-preview"><img src="' + escapeHtml(a.dataUrl) + '" alt="' + escapeHtml(a.name) + '" loading="lazy"></div>';
      }
      return '<div class="attach-file"><svg class="ico"><use href="#i-image"/></svg><span>' + escapeLight(a.name) + ' (preview trimmed)</span></div>';
    }
    return '<div class="attach-file"><svg class="ico"><use href="#i-file"/></svg><span>' + escapeLight(a.name) + '</span></div>';
  }

  function errorHtml(msg) {
    if (!msg.error) return '';
    return '<div class="msg-error"><svg class="ico"><use href="#i-alert"/></svg><div><strong>' +
      escapeLight(msg.error.title) + '</strong><div>' + escapeLight(msg.error.message) + '</div>' +
      '<button type="button" class="retry" data-act="retry"><svg class="ico" style="width:13px;height:13px"><use href="#i-refresh"/></svg>Try again</button></div></div>';
  }

  function assistantBody(msg, streaming) {
    let html = '';
    if (msg.content) {
      const source = streaming ? closeOpenFence(msg.content) : msg.content;
      html += '<div class="md">' + markdown(source) + (streaming ? '<span class="cursor"></span>' : '') + '</div>';
    }
    if (streaming && !msg.content) {
      html += '<div class="typing"><i></i><i></i><i></i><span class="typing-label">Thinking…</span></div>';
    }
    if (msg.error) html += errorHtml(msg);
    if (msg.status === 'stopped' && !msg.content) html += '<div class="typing-label">Stopped.</div>';
    return html;
  }

  function messageHtml(msg) {
    const isUser = msg.role === 'user';
    const name = isUser ? ((state.settings.name || '').trim() || 'You') : 'Wavey AI';
    const tag = isUser ? '' : '<span class="engine-tag">' + escapeLight(msg.engine === 'cloud' ? (msg.model || 'Cloud') : 'Local') + '</span>';
    const time = state.settings.showTimes ? '<span class="msg-time">' + timeLabel(msg.ts) + '</span>' : '';

    let actions = '';
    if (isUser) {
      actions = actionButton('copy', 'copy', 'Copy message') +
        actionButton('edit', 'edit', 'Edit message') +
        actionButton('delete', 'trash', 'Delete message', 'danger');
    } else {
      actions = actionButton('copy', 'copy', 'Copy reply') +
        actionButton('regenerate', 'refresh', 'Regenerate') +
        actionButton('speak', 'volume', 'Read aloud') +
        actionButton('up', 'up', 'Good reply', msg.feedback === 'up' ? 'is-on' : '') +
        actionButton('down', 'down', 'Not helpful', msg.feedback === 'down' ? 'is-bad' : '') +
        actionButton('delete', 'trash', 'Delete reply', 'danger');
    }

    const attachments = (msg.attachments && msg.attachments.length)
      ? '<div class="msg-attachments">' + msg.attachments.map(attachmentHtml).join('') + '</div>'
      : '';

    const body = isUser
      ? (msg.content ? '<div class="msg-body">' + markdown(msg.content) + '</div>' : '')
      : '<div class="msg-body">' + assistantBody(msg, msg.status === 'streaming') + '</div>';

    const initial = (((state.settings.name || 'Y').trim()[0]) || 'Y').toUpperCase();

    return '<article class="msg ' + (isUser ? 'msg-user' : 'msg-assistant') + (msg.status === 'streaming' ? ' is-streaming' : '') + '" data-msg-id="' + msg.id + '">' +
      '<span class="msg-avatar ' + (isUser ? 'you' : 'ai') + '" aria-hidden="true">' + (isUser ? escapeLight(initial) : '<svg class="ico"><use href="#i-sparkle"/></svg>') + '</span>' +
      '<div class="msg-main">' +
      '<div class="msg-head"><span class="msg-name">' + escapeLight(name) + '</span>' + tag + time + '</div>' +
      body + attachments +
      '<div class="msg-actions">' + actions + '</div>' +
      '</div></article>';
  }

  function updateTopbar() {
    const conv = getActive();
    const mode = providerMode();
    const label = mode === 'local' ? 'Wavey Local' : (state.settings.model || 'Cloud model');
    if (el.chatTitle) el.chatTitle.textContent = conv ? conv.title : 'New chat';
    if (el.chatMeta) {
      const count = conv ? conv.messages.filter((m) => m.role === 'user').length : 0;
      el.chatMeta.textContent = (count ? count + (count === 1 ? ' message' : ' messages') + ' · ' : '') +
        (mode === 'openai' ? label : mode === 'openai-nokey' ? 'Wavey Local · no key' : 'Built-in engine');
    }
    if (el.modelLabel) el.modelLabel.textContent = mode === 'local' ? 'Wavey Local' : label;
    if (el.engineDot) el.engineDot.classList.toggle('is-cloud', mode === 'openai');
    if (el.enginePill) {
      el.enginePill.classList.toggle('is-cloud', mode === 'openai');
      el.enginePill.classList.toggle('is-warn', mode === 'openai-nokey');
    }
    if (el.enginePillText) {
      el.enginePillText.textContent = mode === 'local' ? 'Wavey Local' : mode === 'openai-nokey' ? 'Key needed' : label;
    }
    if (el.pinLabel) el.pinLabel.textContent = conv && conv.pinned ? 'Unpin chat' : 'Pin chat';
    document.title = (conv ? conv.title + ' · ' : '') + 'Wavey AI';
  }

  function updateComposerState() {
    if (!el.sendBtn) return;
    el.sendBtn.classList.toggle('is-stop', ui.streaming);
    el.sendBtn.setAttribute('aria-label', ui.streaming ? 'Stop generating' : 'Send message');
    el.sendBtn.title = ui.streaming ? 'Stop generating' : 'Send message';
    if (el.composerHint) {
      el.composerHint.textContent = ui.streaming
        ? 'Generating — press stop or Esc'
        : state.settings.sendOnEnter ? 'Enter to send · Shift+Enter for a new line' : 'Ctrl+Enter to send';
    }
    updateTopbar();
  }

  function renderChat(opts) {
    if (!el.messages) return;
    const conv = getActive();
    const hasMessages = !!(conv && conv.messages.length);

    if (el.welcome) el.welcome.hidden = hasMessages;
    if (!hasMessages) {
      el.messages.innerHTML = '';
      if (el.welcomeTitle) {
        const name = (state.settings.name || '').trim();
        el.welcomeTitle.textContent = name ? 'Hey ' + "it's me," + name + ", It's Wavey." : "Hey, it's me, It's Wavey.";
      }
    } else {
      el.messages.innerHTML = conv.messages.map(messageHtml).join('');
    }

    updateTopbar();
    updateComposerState();

    if (opts && opts.scroll === false) return;
    if (hasMessages && ui.stick) scrollToBottom(false);
    if (el.scrollBottomBtn) el.scrollBottomBtn.hidden = !hasMessages || isNearBottom();
  }

  function paintStream(msg) {
    const node = el.messages ? el.messages.querySelector('[data-msg-id="' + msg.id + '"]') : null;
    if (!node) return;
    const now = performance.now();
    if (now - ui.lastPaint < 40) return;
    ui.lastPaint = now;
    const body = node.querySelector('.msg-body');
    if (!body) return;
    body.innerHTML = assistantBody(msg, true);
    if (ui.stick) scrollToBottom(false);
  }

  /* ----------------------------------------------------------
     13. conversations
     ---------------------------------------------------------- */
  function setActive(id) {
    if (ui.streaming) stopStreaming();
    closeMenus();
    state.activeId = id;
    ui.stick = true;
    renderSidebar();
    renderChat();
    saveSoon();
    if (window.innerWidth <= 860) closeSidebar();
  }

  function newChat() {
    if (ui.streaming) stopStreaming();
    clearEdit();
    ui.attachments = [];
    renderAttachments();
    state.activeId = null;
    ui.stick = true;
    el.promptInput.value = '';
    autosize();
    updateCounter();
    closeMenus();
    renderSidebar();
    renderChat();
    saveSoon();
    if (window.innerWidth <= 860) closeSidebar();
    el.promptInput.focus();
  }

  async function deleteConversation(id) {
    const conv = getConv(id);
    if (!conv) return;
    const ok = await confirmDialog({
      title: 'Delete this chat?',
      body: '“' + conv.title + '” and all of its messages will be removed from this browser. This cannot be undone.',
      confirmText: 'Delete chat'
    });
    if (!ok) return;
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = state.conversations.length ? state.conversations[0].id : null;
    }
    renderSidebar();
    renderChat();
    saveSoon();
    toast('Chat deleted');
  }

  function togglePin(id) {
    const conv = getConv(id);
    if (!conv) return;
    conv.pinned = !conv.pinned;
    renderSidebar();
    updateTopbar();
    saveSoon();
    toast(conv.pinned ? 'Pinned to the top' : 'Unpinned');
  }

  async function clearMessages(id) {
    const conv = getConv(id);
    if (!conv) return;
    const ok = await confirmDialog({
      title: 'Clear messages?',
      body: 'Every message in this chat will be deleted, but the chat itself stays.',
      confirmText: 'Clear messages'
    });
    if (!ok) return;
    if (ui.streaming) stopStreaming();
    conv.messages = [];
    conv.title = 'New chat';
    conv.updatedAt = Date.now();
    renderChat();
    renderSidebar();
    saveSoon();
    toast('Messages cleared');
  }

  function startRename(id) {
    ui.renamingId = id;
    closeMenus();
    renderSidebar();
  }

  function commitRename(input, id) {
    if (!input || ui.renamingId !== id) return;
    const conv = getConv(id);
    const value = input.value.replace(/\s+/g, ' ').trim();
    if (conv && value) {
      conv.title = value.slice(0, 80);
      conv.updatedAt = Date.now();
      updateTopbar();
    }
    ui.renamingId = null;
    renderSidebar();
    saveSoon();
  }

  function ensureConversation() {
    let conv = getActive();
    if (!conv) {
      conv = createConversation();
      state.activeId = conv.id;
    }
    return conv;
  }

  /* ----------------------------------------------------------
     14. sending & streaming
     ---------------------------------------------------------- */
  function stopStreaming() {
    if (ui.abort) {
      try { ui.abort.abort(); } catch (e) { /* ignore */ }
    }
  }

  async function runAssistant(conv) {
    const mode = providerMode();
    const msg = {
      id: uid(),
      role: 'assistant',
      content: '',
      ts: Date.now(),
      attachments: [],
      model: mode === 'local' ? 'Wavey Local' : state.settings.model,
      engine: mode === 'local' ? 'local' : 'cloud',
      status: 'streaming',
      error: null,
      feedback: null
    };
    conv.messages.push(msg);
    conv.updatedAt = Date.now();

    ui.streaming = true;
    ui.stick = true;
    ui.abort = new AbortController();
    ui.lastPaint = 0;
    renderChat();
    renderSidebar();
    updateComposerState();
    saveSoon();

    const signal = ui.abort.signal;

    try {
      if (mode === 'openai-nokey') throw new Error('NOKEY');
      const source = mode === 'local' ? streamLocal(conv, signal) : streamOpenAI(conv, signal);
      for await (const chunk of source) {
        if (signal.aborted) throw abortError();
        msg.content += chunk;
        paintStream(msg);
      }
      msg.status = 'done';
      if (!msg.content.trim()) msg.content = '_The endpoint returned an empty reply._';
    } catch (err) {
      if (err && err.name === 'AbortError') {
        msg.status = 'stopped';
      } else {
        const friendly = friendlyError(err);
        msg.status = 'error';
        msg.error = friendly || { title: 'Something went wrong', message: 'Unknown error.' };
      }
    } finally {
      ui.streaming = false;
      ui.abort = null;
      ui.lastPaint = 0;
      conv.updatedAt = Date.now();
      renderSidebar();
      renderChat();
      updateComposerState();
      saveSoon();
      if (msg.error) toast(msg.error.title, 'error');
    }
  }

  async function sendMessage() {
    if (ui.streaming) return;
    const text = el.promptInput.value.trim();
    if (!text && !ui.attachments.length) {
      el.promptInput.focus();
      return;
    }
    if (text.length > MAX_INPUT) {
      toast('That message is too long. Keep it under ' + MAX_INPUT.toLocaleString() + ' characters.', 'error');
      return;
    }

    let conv = null;

    if (ui.editing) {
      const targetConv = getConv(ui.editing.convId);
      if (targetConv) {
        const index = targetConv.messages.findIndex((m) => m.id === ui.editing.msgId);
        if (index >= 0) {
          const original = targetConv.messages[index];
          targetConv.messages = targetConv.messages.slice(0, index);
          targetConv.messages.push(Object.assign({}, original, {
            content: text,
            ts: Date.now(),
            status: 'done',
            error: null,
            feedback: null
          }));
          conv = targetConv;
          state.activeId = targetConv.id;
        }
      }
      ui.editing = null;
      renderEditBanner();
    }

    if (!conv) {
      conv = ensureConversation();
      conv.messages.push({
        id: uid(),
        role: 'user',
        content: text,
        ts: Date.now(),
        attachments: ui.attachments.slice(),
        model: '',
        engine: 'local',
        status: 'done',
        error: null,
        feedback: null
      });
      if (!conv.title || conv.title === 'New chat') {
        conv.title = deriveTitle(text, ui.attachments);
      }
      conv.updatedAt = Date.now();
      ui.attachments = [];
      renderAttachments();
    }

    el.promptInput.value = '';
    autosize();
    updateCounter();
    ui.stick = true;
    closeMenus();
    renderSidebar();
    renderChat();
    saveSoon();
    el.promptInput.focus();

    await runAssistant(conv);
  }

  function regenerate(msgId) {
    if (ui.streaming) return;
    const conv = getActive();
    if (!conv) return;
    let index = msgId ? conv.messages.findIndex((m) => m.id === msgId) : -1;
    if (index < 0) {
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'assistant') { index = i; break; }
      }
    }
    if (index < 0) {
      toast('There is nothing to regenerate yet.', 'error');
      return;
    }
    conv.messages = conv.messages.slice(0, index);
    conv.updatedAt = Date.now();
    renderChat();
    renderSidebar();
    saveSoon();
    runAssistant(conv);
  }

  function editMessage(msgId) {
    if (ui.streaming) return;
    const conv = getActive();
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === msgId);
    if (!msg) return;
    ui.editing = { convId: conv.id, msgId: msg.id };
    renderEditBanner();
    el.promptInput.value = msg.content;
    autosize();
    updateCounter();
    el.promptInput.focus();
    el.promptInput.setSelectionRange(el.promptInput.value.length, el.promptInput.value.length);
    scrollToBottom(true);
  }

  function renderEditBanner() {
    let banner = document.getElementById('editBanner');
    if (!ui.editing) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'editBanner';
      banner.className = 'edit-banner';
      el.composerForm.insertBefore(banner, el.composerForm.firstChild);
    }
    banner.innerHTML = '<svg class="ico"><use href="#i-edit"/></svg><span>Editing your message — sending replaces it and everything after.</span>' +
      '<button type="button" id="cancelEdit">Cancel</button>';
  }

  function clearEdit() {
    ui.editing = null;
    renderEditBanner();
  }

  function deleteMessage(msgId) {
    if (ui.streaming) return;
    const conv = getActive();
    if (!conv) return;
    const index = conv.messages.findIndex((m) => m.id === msgId);
    if (index < 0) return;
    conv.messages.splice(index, 1);
    conv.updatedAt = Date.now();
    if (!conv.messages.length) conv.title = 'New chat';
    renderChat();
    renderSidebar();
    saveSoon();
    toast('Message deleted');
  }

  function setFeedback(msgId, kind) {
    const conv = getActive();
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === msgId);
    if (!msg) return;
    msg.feedback = msg.feedback === kind ? null : kind;
    const node = el.messages.querySelector('[data-msg-id="' + msgId + '"]');
    if (node) {
      const up = node.querySelector('[data-act="up"]');
      const down = node.querySelector('[data-act="down"]');
      if (up) up.classList.toggle('is-on', msg.feedback === 'up');
      if (down) down.classList.toggle('is-bad', msg.feedback === 'down');
    }
    saveSoon();
    if (msg.feedback) toast('Thanks — that stays on this device.');
  }

  function handleAction(act, msgId) {
    const conv = getActive();
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === msgId);
    if (!msg) return;
    switch (act) {
      case 'copy':
        copyText(msg.content).then((ok) => toast(ok ? 'Copied to clipboard' : 'Copy failed — select the text manually', ok ? null : 'error'));
        break;
      case 'regenerate':
      case 'retry':
        regenerate(msgId);
        break;
      case 'edit':
        editMessage(msgId);
        break;
      case 'delete':
        deleteMessage(msgId);
        break;
      case 'up':
        setFeedback(msgId, 'up');
        break;
      case 'down':
        setFeedback(msgId, 'down');
        break;
      case 'speak':
        speak(msgId);
        break;
      default:
        break;
    }
  }

  /* ----------------------------------------------------------
     15. attachments
     ---------------------------------------------------------- */
  function renderAttachments() {
    if (!el.attachmentStrip) return;
    if (!ui.attachments.length) {
      el.attachmentStrip.hidden = true;
      el.attachmentStrip.innerHTML = '';
      return;
    }
    el.attachmentStrip.hidden = false;
    el.attachmentStrip.innerHTML = ui.attachments.map((a) => {
      const preview = a.kind === 'image'
        ? '<img src="' + escapeHtml(a.dataUrl) + '" alt="">'
        : '<svg class="ico"><use href="#i-file"/></svg>';
      return '<div class="pending-attach">' + preview +
        '<div class="file-meta"><span>' + escapeLight(a.name) + '</span><small>' + formatBytes(a.size) + '</small></div>' +
        '<button type="button" class="pending-remove" data-remove="' + a.id + '" aria-label="Remove attachment"><svg class="ico"><use href="#i-x"/></svg></button></div>';
    }).join('');
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });
  }

  function isTextLike(file) {
    if (file.type && file.type.indexOf('text/') === 0) return true;
    if (/(json|javascript|xml|x-sh|sql)/.test(file.type || '')) return true;
    return /\.(txt|md|markdown|js|mjs|cjs|jsx|ts|tsx|json|html|css|py|rb|go|rs|java|c|cpp|h|sh|yml|yaml|sql|csv|log|example)$/i.test(file.name);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      if (ui.attachments.length >= MAX_ATTACHMENTS) {
        toast('Up to ' + MAX_ATTACHMENTS + ' attachments per message.', 'error');
        break;
      }
      if (file.type && file.type.indexOf('image/') === 0) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast(file.name + ' is larger than 4 MB.', 'error');
          continue;
        }
        try {
          const dataUrl = await readAsDataURL(file);
          ui.attachments.push({ id: uid(), kind: 'image', name: file.name, size: file.size, mime: file.type || 'image/png', dataUrl: dataUrl });
        } catch (e) {
          toast('Could not read ' + file.name, 'error');
        }
      } else if (isTextLike(file)) {
        if (file.size > MAX_TEXT_BYTES) {
          toast(file.name + ' is too large (400 KB limit).', 'error');
          continue;
        }
        try {
          const text = await file.text();
          ui.attachments.push({ id: uid(), kind: 'text', name: file.name, size: file.size, mime: file.type || 'text/plain', text: text.slice(0, MAX_TEXT_CHARS) });
        } catch (e) {
          toast('Could not read ' + file.name, 'error');
        }
      } else {
        toast('Unsupported file type: ' + (file.type || file.name) + '. Try an image or a text/code file.', 'error');
      }
    }
    renderAttachments();
  }

  /* ----------------------------------------------------------
     16. speech
     ---------------------------------------------------------- */
  let recognition = null;

  function speak(msgId) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      toast('Read-aloud is not supported in this browser.', 'error');
      return;
    }
    const conv = getActive();
    const msg = conv && conv.messages.find((m) => m.id === msgId);
    if (!msg || !msg.content) return;

    if (ui.speakingId === msgId) {
      window.speechSynthesis.cancel();
      ui.speakingId = null;
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plainText(msg.content).slice(0, 6000));
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => { ui.speakingId = null; };
    utterance.onerror = () => { ui.speakingId = null; };
    ui.speakingId = msgId;
    window.speechSynthesis.speak(utterance);
  }

  function toggleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast('Speech input is not supported here. Chrome or Edge work best.', 'error');
      return;
    }
    if (ui.recording && recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
      return;
    }
    try {
      recognition = new SpeechRecognition();
    } catch (e) {
      toast('Could not start speech recognition.', 'error');
      return;
    }
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    const base = el.promptInput.value.trim();

    recognition.onstart = () => {
      ui.recording = true;
      el.micBtn.classList.add('is-recording');
      el.micBtn.title = 'Stop dictation';
    };
    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      const spoken = (finalText || interim).trim();
      el.promptInput.value = base ? base + ' ' + spoken : spoken;
      autosize();
      updateCounter();
    };
    recognition.onerror = (event) => {
      const map = {
        'not-allowed': 'Microphone permission was denied.',
        'no-speech': 'I did not hear anything.',
        'audio-capture': 'No microphone was found.'
      };
      toast(map[event.error] || 'Speech recognition stopped: ' + event.error, 'error');
    };
    recognition.onend = () => {
      ui.recording = false;
      el.micBtn.classList.remove('is-recording');
      el.micBtn.title = 'Dictate (speech to text)';
      el.promptInput.focus();
    };
    try {
      recognition.start();
    } catch (e) {
      toast('Could not start the microphone.', 'error');
    }
  }

  /* ----------------------------------------------------------
     17. settings
     ---------------------------------------------------------- */
  function openSettings(tab) {
    syncSettingsUI();
    switchSettingsTab(tab || 'general');
    openModal('settings');
  }

  function syncSettingsUI() {
    if (!el.settingsModal) return;
    const s = state.settings;
    if (el.setName) el.setName.value = s.name || '';
    if (el.setFont) el.setFont.value = ['small', 'medium', 'large'].includes(s.fontSize) ? s.fontSize : 'medium';
    if (el.setSystem) el.setSystem.value = s.systemPrompt || '';
    if (el.setEnter) el.setEnter.checked = !!s.sendOnEnter;
    if (el.setStream) el.setStream.checked = !!s.stream;
    if (el.setTimes) el.setTimes.checked = !!s.showTimes;
    if (el.setTemp) el.setTemp.value = String(s.temperature);
    if (el.tempVal) el.tempVal.textContent = Number(s.temperature).toFixed(1);
    if (el.setProvider) el.setProvider.value = s.provider === 'openai' ? 'openai' : 'local';
    if (el.setBase) el.setBase.value = s.baseUrl || '';
    if (el.setKey) el.setKey.value = s.apiKey || '';
    if (el.setModel) el.setModel.value = s.model || '';
    $$('#themeSeg button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.themeVal === (s.theme || 'system'));
    });
    if (el.modelList) {
      el.modelList.innerHTML = MODELS.map((m) => '<option value="' + m.id + '">' + m.label + '</option>').join('');
    }
    updateModelCallout();
    storageInfo();
  }

  function updateModelCallout() {
    if (!el.modelCalloutText) return;
    const s = state.settings;
    if (s.provider === 'openai' && hasKey()) {
      el.modelCalloutText.textContent = 'Connected to ' + (s.model || 'a cloud model') + ' at ' + (s.baseUrl || 'the configured endpoint') +
        '. Messages go straight from this browser to that endpoint.';
    } else if (s.provider === 'openai') {
      el.modelCalloutText.textContent = 'Paste an API key below to use a cloud model. Until then, Wavey Local keeps answering — nothing breaks, nothing is lost.';
    } else {
      el.modelCalloutText.textContent = 'Wavey Local runs entirely in this page — no account, no network, no setup. Connect a cloud model below if you want live GPT answers; the rest of the app is identical.';
    }
  }

  function buildModelMenu() {
    if (!el.modelMenu) return;
    const mode = providerMode();
    const cloud = mode === 'openai';
    const noKey = mode === 'openai-nokey';
    let html = '<div class="menu-label">Built in</div>' +
      '<button type="button" class="menu-item model-item" data-model="__local" role="menuitemradio" aria-checked="' + (mode === 'local') + '">' +
      '<span class="model-info"><strong>Wavey Local</strong><small>Instant · offline · no key</small></span>' +
      '<svg class="ico check"><use href="#i-check"/></svg></button>' +
      '<div class="menu-sep"></div>' +
      '<div class="menu-label">Cloud models' + (noKey ? ' · key needed' : '') + '</div>';
    MODELS.forEach((m) => {
      html += '<button type="button" class="menu-item model-item" data-model="' + m.id + '" role="menuitemradio" aria-checked="' + (cloud && state.settings.model === m.id) + '">' +
        '<span class="model-info"><strong>' + m.label + '</strong><small>' + m.note + '</small></span>' +
        '<svg class="ico check"><use href="#i-check"/></svg></button>';
    });
    html += '<div class="menu-sep"></div>' +
      '<button type="button" class="menu-item" data-model="__settings"><svg class="ico"><use href="#i-key"/></svg>Model settings…</button>';
    el.modelMenu.innerHTML = html;
  }

  async function testConnection() {
    if (!el.connResult) return;
    const key = (el.setKey ? el.setKey.value : '').trim();
    const base = (el.setBase ? el.setBase.value : '').trim() || 'https://api.openai.com/v1';
    const model = (el.setModel ? el.setModel.value : '').trim() || 'gpt-4o-mini';
    const clean = base.replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(clean) ? clean : clean + '/chat/completions';

    el.connResult.className = 'hint test-result';
    if (!key) {
      el.connResult.textContent = 'Paste an API key first. Wavey Local already works without one.';
      el.connResult.classList.add('is-bad');
      return;
    }
    el.connResult.textContent = 'Testing…';
    el.testConn.disabled = true;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
          stream: false,
          max_tokens: 16
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw apiError(res.status, text);
      }
      const data = await res.json();
      const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      el.connResult.className = 'hint test-result is-ok';
      el.connResult.textContent = 'Connected — ' + model + ' replied: “' + String(reply || '(empty)').trim().slice(0, 60) + '”';
    } catch (err) {
      const friendly = friendlyError(err) || { title: 'Failed', message: 'Unknown error.' };
      el.connResult.className = 'hint test-result is-bad';
      el.connResult.textContent = friendly.title + ' — ' + friendly.message;
    } finally {
      el.testConn.disabled = false;
    }
  }

  /* ----------------------------------------------------------
     18. export / import
     ---------------------------------------------------------- */
  function convToMarkdown(conv) {
    let out = '# ' + conv.title + '\n\n';
    out += '_Exported from Wavey AI · ' + new Date().toLocaleString() + '_\n\n---\n\n';
    conv.messages.forEach((m) => {
      out += '## ' + (m.role === 'user' ? 'You' : 'Wavey AI');
      if (m.ts) out += ' · ' + new Date(m.ts).toLocaleString();
      out += '\n\n';
      (m.attachments || []).forEach((a) => {
        out += '> Attachment: ' + a.name + (a.kind === 'image' ? ' (image, not included in Markdown)' : '') + '\n';
      });
      if (m.attachments && m.attachments.length) out += '\n';
      out += (m.content || '_(empty)_') + '\n\n';
    });
    return out;
  }

  function exportCurrent(format) {
    const conv = getActive();
    if (!conv) {
      toast('There is no chat to export yet.', 'error');
      return;
    }
    if (format === 'json') {
      download(slugify(conv.title) + '.json', JSON.stringify(conv, null, 2), 'application/json');
      toast('Chat exported as JSON');
      return;
    }
    download(slugify(conv.title) + '.md', convToMarkdown(conv), 'text/markdown;charset=utf-8');
    toast('Chat exported as Markdown');
  }

  function exportAllChats() {
    const payload = {
      app: 'Wavey AI',
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations: state.conversations,
      settings: Object.assign({}, state.settings, { apiKey: '' })
    };
    download('wavey-ai-history-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('All chats exported (API key excluded)');
  }

  async function importChats(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : Array.isArray(data.conversations) ? data.conversations : null;
      if (!list) throw new Error('No conversations array found.');
      let count = 0;
      list.forEach((raw) => {
        const conv = normalizeConversation(raw);
        if (!conv) return;
        conv.id = uid();
        conv.messages.forEach((m) => { m.id = uid(); });
        conv.updatedAt = +raw.updatedAt || Date.now();
        state.conversations.unshift(conv);
        count++;
      });
      if (!count) throw new Error('That file did not contain any chats.');
      renderSidebar();
      renderChat();
      saveSoon();
      toast('Imported ' + count + (count === 1 ? ' chat' : ' chats'));
    } catch (e) {
      toast('Import failed: ' + (e.message || 'invalid JSON'), 'error');
    }
  }

  /* ----------------------------------------------------------
     19. layout helpers
     ---------------------------------------------------------- */
  function autosize() {
    if (!el.promptInput) return;
    el.promptInput.style.height = 'auto';
    const next = Math.min(el.promptInput.scrollHeight, 220);
    el.promptInput.style.height = Math.max(24, next) + 'px';
  }

  function updateCounter() {
    if (!el.charCount || !el.promptInput) return;
    const length = el.promptInput.value.length;
    el.charCount.textContent = length ? String(length) : '0';
    el.charCount.classList.toggle('is-near', length > MAX_INPUT * 0.9);
  }

  function openSidebar() {
    el.app.classList.add('sidebar-open');
    el.scrim.hidden = false;
  }

  function closeSidebar() {
    el.app.classList.remove('sidebar-open');
    el.scrim.hidden = true;
  }

  /* ----------------------------------------------------------
     20. event wiring
     ---------------------------------------------------------- */
  function bindEvents() {
    el.composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (ui.streaming) { stopStreaming(); return; }
      sendMessage();
    });

    el.sendBtn.addEventListener('click', (e) => {
      if (ui.streaming) {
        e.preventDefault();
        stopStreaming();
      }
    });

    el.promptInput.addEventListener('input', () => {
      autosize();
      updateCounter();
    });

    el.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (state.settings.sendOnEnter && !e.shiftKey && !e.altKey && !e.isComposing) {
          e.preventDefault();
          if (!ui.streaming) sendMessage();
          return;
        }
        if (!state.settings.sendOnEnter && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (!ui.streaming) sendMessage();
          return;
        }
      }
      if (e.key === 'ArrowUp' && !e.shiftKey && !el.promptInput.value.trim() && !ui.editing) {
        const conv = getActive();
        if (!conv) return;
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          if (conv.messages[i].role === 'user') {
            e.preventDefault();
            editMessage(conv.messages[i].id);
            break;
          }
        }
      }
    });

    el.promptInput.addEventListener('paste', (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) {
        e.preventDefault();
        addFiles(files);
      }
    });

    if (composerBox) {
      composerBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        composerBox.classList.add('is-drag');
      });
      composerBox.addEventListener('dragleave', () => composerBox.classList.remove('is-drag'));
      composerBox.addEventListener('drop', (e) => {
        e.preventDefault();
        composerBox.classList.remove('is-drag');
        if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      });
    }

    el.attachBtn.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', () => {
      addFiles(el.fileInput.files);
      el.fileInput.value = '';
    });

    el.attachmentStrip.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      ui.attachments = ui.attachments.filter((a) => a.id !== btn.dataset.remove);
      renderAttachments();
    });

    el.micBtn.addEventListener('click', toggleDictation);

    el.composerForm.addEventListener('click', (e) => {
      if (e.target.closest('#cancelEdit')) {
        clearEdit();
        el.promptInput.value = '';
        autosize();
        updateCounter();
        el.promptInput.focus();
      }
    });

    el.messages.addEventListener('click', (e) => {
      const codeBtn = e.target.closest('[data-copy-code]');
      if (codeBtn) {
        const block = codeBtn.closest('.code-block');
        const code = block ? block.querySelector('code') : null;
        if (code) {
          copyText(code.textContent).then((ok) => {
            if (!ok) { toast('Copy failed', 'error'); return; }
            const original = codeBtn.innerHTML;
            codeBtn.innerHTML = '<svg class="ico"><use href="#i-check"/></svg>Copied';
            setTimeout(() => { codeBtn.innerHTML = original; }, 1400);
          });
        }
        return;
      }
      const action = e.target.closest('[data-act]');
      if (!action) return;
      const node = action.closest('[data-msg-id]');
      if (!node) return;
      handleAction(action.dataset.act, node.dataset.msgId);
    });

    el.messages.addEventListener('dblclick', (e) => {
      const md = e.target.closest('.md');
      if (!md) return;
      const selection = window.getSelection();
      if (selection && selection.toString()) return;
      const node = md.closest('[data-msg-id]');
      const conv = getActive();
      if (!node || !conv) return;
      const msg = conv.messages.find((m) => m.id === node.dataset.msgId);
      if (!msg) return;
      copyText(msg.content).then((ok) => toast(ok ? 'Copied to clipboard' : 'Copy failed', ok ? null : 'error'));
    });

    el.chatScroll.addEventListener('scroll', () => {
      ui.stick = isNearBottom();
      if (el.scrollBottomBtn) el.scrollBottomBtn.hidden = ui.stick || !el.messages.children.length;
    });
    el.scrollBottomBtn.addEventListener('click', () => {
      ui.stick = true;
      scrollToBottom(true);
    });

    el.newChatBtn.addEventListener('click', newChat);
    el.menuBtn.addEventListener('click', openSidebar);
    el.sidebarClose.addEventListener('click', closeSidebar);
    el.scrim.addEventListener('click', closeSidebar);

    el.convSearch.addEventListener('input', () => {
      ui.query = el.convSearch.value;
      renderSidebar();
    });
    el.searchClear.addEventListener('click', () => {
      el.convSearch.value = '';
      ui.query = '';
      renderSidebar();
      el.convSearch.focus();
    });

    el.conversationList.addEventListener('click', (e) => {
      if (e.target.closest('.rename-input')) return;
      const item = e.target.closest('.conv-item');
      if (!item) return;
      const id = item.dataset.id;
      const tool = e.target.closest('[data-tool]');
      if (tool) {
        e.stopPropagation();
        if (tool.dataset.tool === 'pin') togglePin(id);
        else if (tool.dataset.tool === 'delete') deleteConversation(id);
        return;
      }
      setActive(id);
    });

    el.conversationList.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.conv-item');
      if (!item || e.target.closest('.conv-tool')) return;
      e.preventDefault();
      startRename(item.dataset.id);
    });

    el.conversationList.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('rename-input')) {
        const input = e.target;
        const item = input.closest('.conv-item');
        if (!item) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRename(input, item.dataset.id);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          ui.renamingId = null;
          renderSidebar();
        }
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('conv-item')) {
        e.preventDefault();
        setActive(e.target.dataset.id);
      }
    });

    el.conversationList.addEventListener('focusout', (e) => {
      const input = e.target && e.target.closest ? e.target.closest('.rename-input') : null;
      if (!input) return;
      const item = input.closest('.conv-item');
      if (item) commitRename(input, item.dataset.id);
    });

    el.modelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(el.modelBtn, el.modelMenu);
    });
    el.moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(el.moreBtn, el.moreMenu);
    });

    el.modelMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-model]');
      if (!item) return;
      const model = item.dataset.model;
      if (model === '__settings') {
        closeMenus();
        openSettings('model');
        return;
      }
      if (model === '__local') {
        state.settings.provider = 'local';
        closeMenus();
        updateComposerState();
        updateModelCallout();
        saveSoon();
        toast('Using Wavey Local');
        renderChat({ scroll: false });
        return;
      }
      state.settings.model = model;
      if (!hasKey()) {
        closeMenus();
        saveSoon();
        updateComposerState();
        toast('Add a key in Settings → Model to use ' + model + '. Wavey Local is still active.', 'error');
        openSettings('model');
        return;
      }
      state.settings.provider = 'openai';
      closeMenus();
      updateComposerState();
      updateModelCallout();
      saveSoon();
      renderChat({ scroll: false });
      toast('Using ' + model);
    });

    el.moreMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-more]');
      if (!item) return;
      const action = item.dataset.more;
      closeMenus();
      const conv = getActive();
      if (!conv) {
        toast('Open a chat first.', 'error');
        return;
      }
      switch (action) {
        case 'rename': startRename(conv.id); break;
        case 'pin': togglePin(conv.id); break;
        case 'clear': clearMessages(conv.id); break;
        case 'export-md': exportCurrent('md'); break;
        case 'export-json': exportCurrent('json'); break;
        case 'delete': deleteConversation(conv.id); break;
        default: break;
      }
    });

    el.exportBtn.addEventListener('click', () => exportCurrent('md'));

    el.themeBtn.addEventListener('click', cycleTheme);
    el.settingsBtn.addEventListener('click', () => openSettings('general'));
    el.profileBtn.addEventListener('click', () => {
      openSettings('general');
      setTimeout(() => { if (el.setName) el.setName.focus(); }, 60);
    });

    el.settingsTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      switchSettingsTab(tab.dataset.tab);
    });

    el.setName.addEventListener('input', () => {
      state.settings.name = el.setName.value.slice(0, 40);
      applyIdentity();
      saveSoon();
    });
    el.themeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-val]');
      if (!btn) return;
      state.settings.theme = btn.dataset.themeVal;
      applyTheme();
      syncSettingsUI();
      saveSoon();
    });
    el.setFont.addEventListener('change', () => {
      state.settings.fontSize = el.setFont.value;
      applyFont();
      saveSoon();
    });
    el.setSystem.addEventListener('input', () => {
      state.settings.systemPrompt = el.setSystem.value;
      saveSoon();
    });
    el.setEnter.addEventListener('change', () => {
      state.settings.sendOnEnter = el.setEnter.checked;
      updateComposerState();
      saveSoon();
    });
    el.setStream.addEventListener('change', () => {
      state.settings.stream = el.setStream.checked;
      saveSoon();
    });
    el.setTimes.addEventListener('change', () => {
      state.settings.showTimes = el.setTimes.checked;
      renderChat({ scroll: false });
      saveSoon();
    });
    el.setTemp.addEventListener('input', () => {
      state.settings.temperature = Number(el.setTemp.value);
      if (el.tempVal) el.tempVal.textContent = Number(el.setTemp.value).toFixed(1);
      saveSoon();
    });

    el.setProvider.addEventListener('change', () => {
      state.settings.provider = el.setProvider.value === 'openai' ? 'openai' : 'local';
      updateComposerState();
      updateModelCallout();
      renderChat({ scroll: false });
      saveSoon();
    });
    el.setBase.addEventListener('input', () => {
      state.settings.baseUrl = el.setBase.value.trim();
      saveSoon();
    });
    el.setKey.addEventListener('input', () => {
      state.settings.apiKey = el.setKey.value;
      updateComposerState();
      updateModelCallout();
      saveSoon();
    });
    el.setModel.addEventListener('input', () => {
      state.settings.model = el.setModel.value.trim();
      updateComposerState();
      saveSoon();
    });
    el.toggleKey.addEventListener('click', () => {
      const showing = el.setKey.type === 'text';
      el.setKey.type = showing ? 'password' : 'text';
      el.toggleKey.textContent = showing ? 'Show' : 'Hide';
    });
    el.clearKey.addEventListener('click', () => {
      el.setKey.value = '';
      state.settings.apiKey = '';
      updateComposerState();
      updateModelCallout();
      saveSoon();
      toast('API key cleared from this browser');
    });
    el.testConn.addEventListener('click', testConnection);

    el.exportAll.addEventListener('click', exportAllChats);
    el.exportChat.addEventListener('click', () => exportCurrent('md'));
    el.importBtn.addEventListener('click', () => el.importInput.click());
    el.importInput.addEventListener('change', () => {
      importChats(el.importInput.files && el.importInput.files[0]);
      el.importInput.value = '';
    });
    el.clearAll.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete all chats?',
        body: 'Every conversation in this browser will be removed. Export first if you want a copy. This cannot be undone.',
        confirmText: 'Delete everything'
      });
      if (!ok) return;
      state.conversations = [];
      state.activeId = null;
      ui.query = '';
      el.convSearch.value = '';
      renderSidebar();
      renderChat();
      writeNow();
      storageInfo();
      toast('All chats deleted');
    });
    el.resetSettings.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset settings?',
        body: 'Theme, text size, custom instructions, model configuration and the saved API key all return to defaults. Chats are kept.',
        confirmText: 'Reset settings',
        danger: false
      });
      if (!ok) return;
      state.settings = Object.assign({}, DEFAULTS);
      applyTheme();
      applyFont();
      applyIdentity();
      syncSettingsUI();
      renderChat({ scroll: false });
      saveSoon();
      toast('Settings reset');
    });

    el.aboutShortcuts.addEventListener('click', () => openModal('shortcuts'));

    el.suggestions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-prompt]');
      if (!btn || ui.streaming) return;
      el.promptInput.value = btn.dataset.prompt;
      autosize();
      updateCounter();
      sendMessage();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) closeMenus();
      const closer = e.target.closest('[data-close]');
      if (closer) closeModal(closer.dataset.close);
    });

    el.confirmOk.addEventListener('click', () => {
      const fn = ui.confirmResolve;
      ui.confirmResolve = null;
      if (el.confirmModal) el.confirmModal.hidden = true;
      ui.modal = null;
      if (fn) fn(true);
    });
    el.confirmCancel.addEventListener('click', () => closeModal('confirm'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (ui.modal) { closeModal(ui.modal); return; }
        if (el.modelMenu && !el.modelMenu.hidden) { closeMenus(); return; }
        if (el.moreMenu && !el.moreMenu.hidden) { closeMenus(); return; }
        if (ui.recording) { toggleDictation(); return; }
        if (ui.streaming) { stopStreaming(); return; }
        if (el.app.classList.contains('sidebar-open')) { closeSidebar(); return; }
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        newChat();
      } else if (e.key === 'f' || e.key === 'F') {
        if (ui.modal) return;
        e.preventDefault();
        if (window.innerWidth <= 860) openSidebar();
        el.convSearch.focus();
        el.convSearch.select();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (window.innerWidth <= 860) {
          if (el.app.classList.contains('sidebar-open')) closeSidebar();
          else openSidebar();
        }
      } else if (e.key === '/') {
        e.preventDefault();
        openModal('shortcuts');
      }
    });

    if (media) {
      const onChange = () => { if (state.settings.theme === 'system') applyTheme(); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) closeSidebar();
    });

    window.addEventListener('beforeunload', writeNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') writeNow();
    });
  }

  /* ----------------------------------------------------------
     21. boot
     ---------------------------------------------------------- */
  function init() {
    loadState();
    ['name', 'theme', 'fontSize', 'systemPrompt', 'provider', 'baseUrl', 'apiKey', 'model'].forEach((key) => {
      if (typeof state.settings[key] !== 'string') state.settings[key] = DEFAULTS[key];
    });
    applyTheme();
    applyFont();
    applyIdentity();
    renderSidebar();
    renderChat();
    updateCounter();
    autosize();
    renderAttachments();
    bindEvents();
    syncSettingsUI();
    updateComposerState();
    storageInfo();
    el.promptInput.focus();

    if (!state.conversations.length) {
      toast('Wavey Local is ready — no key needed.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
