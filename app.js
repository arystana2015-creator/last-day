/* Связывает страницу с расчётами из calc.js: вкладки-режимы, результат, тема, анимации, галерея.
   Ничего не отправляет. В localStorage хранится только выбранная тема. */
(function () {
  'use strict';
  var C = window.LastDay;
  if (!C) return;
  var TK = 'https://adilet.zan.kz/rus/docs/K1500000414';

  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduced() { return reduceMq.matches; }

  /* ---------- Форматирование ---------- */
  function fmt(iso, withWeekday) {
    var s = +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
    return withWeekday === false ? s : s + ', ' + WEEKDAYS[C.weekday(iso)];
  }
  function short(iso) { return +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ref(anchor, text) { return ' <a class="ref" href="' + TK + '#' + anchor + '" target="_blank" rel="noopener">' + text + '</a>'; }
  // «Суббота» → «суббота», «День Победы» → «день Победы»: только первая буква, имена собственные не трогаем
  function lowerFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }
  // «1 месяц», «2 месяца и 10 дней», «45 дней»
  function periodText(m, d) {
    var parts = [];
    if (m) parts.push(m + ' ' + plural(m, 'месяц', 'месяца', 'месяцев'));
    if (d) parts.push(d + ' ' + plural(d, 'день', 'дня', 'дней'));
    return parts.join(' и ');
  }
  // Пустое поле — 0; иначе число (дробь или текст дадут ошибку в calc.js)
  function toCount(v) { v = String(v).trim(); return v === '' ? 0 : Number(v); }
  function todayIso() {
    var t = new Date();
    return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())).toISOString().slice(0, 10);
  }
  function clamp(iso) { return iso < C.CALENDAR_FROM ? C.CALENDAR_FROM : (iso > C.CALENDAR_TO ? C.CALENDAR_TO : iso); }

  /* ---------- Тексты ошибок ---------- */
  var ERRORS = {
    'invalid-date': 'Укажите дату.',
    'invalid-period': 'Укажите срок целыми числами: месяцев от 0 до 24, дней от 0 до 730, хотя бы одно значение больше нуля.',
    'too-short': 'По закону работник предупреждает работодателя не менее чем за один месяц (ст. 56 п. 1 ТК РК). Более короткий срок — только в особом случае из п. 3 этой статьи, его калькулятор не считает.',
    'before-calendar': 'Калькулятор считает даты начиная с 1 июля 2026 года: с этого дня действует новый список праздников.',
    'after-calendar': 'Результат выходит за 31 декабря 2027 года, а календарь праздников заведён только до этой даты. Сверьтесь с производственным календарём.'
  };
  function errorHtml(r, dateMsg) {
    var msg = (r.error === 'invalid-date' && dateMsg) || ERRORS[r.error] || 'Не удалось рассчитать.';
    return '<p class="error" role="alert">' + esc(msg) + '</p>';
  }

  /* ---------- Разметка результата ---------- */
  // Пункт ленты: i — порядок появления, mod — 'main' для главной даты
  function tl(i, label, date, note, mod) {
    return '<li class="tl' + (mod ? ' tl--' + mod : '') + '" style="--i:' + i + '"><span class="tl__mark" aria-hidden="true"></span>' +
      '<p class="tl__label">' + label + '</p><p class="tl__date">' + date + '</p>' +
      (note ? '<p class="tl__note">' + note + '</p>' : '') + '</li>';
  }
  function list(items, i) { return '<ul class="notes" style="--i:' + i + '">' + items.join('') + '</ul>'; }

  // Примечания к расчёту срока уведомления (режимы 1 и 2)
  function periodNotes(r) {
    var notes = [];
    if (r.noticeOnDayOff && r.wantedLastDay) {
      // режим «Когда подать»: рекомендованная дата выпала на выходной
      notes.push('<li class="note note--warn">' + short(r.noticeDate) + ' — нерабочий день (' + esc(lowerFirst(r.noticeOnDayOff)) +
        '). Надёжнее вручить уведомление заранее, в последний рабочий день перед этой датой: срок считается от дня, когда работодатель его получил.</li>');
    } else if (r.noticeOnDayOff) {
      notes.push('<li class="note note--warn">' + short(r.noticeDate) + ' — нерабочий день (' + esc(lowerFirst(r.noticeOnDayOff)) +
        '). Срок считается от даты, когда работодатель фактически получил уведомление.</li>');
    }
    if (r.months !== 1 || r.days !== 0) {
      notes.push('<li class="note">Срок по вашему трудовому договору — ' + periodText(r.months, r.days) +
        '. Договор может установить срок длиннее месяца, но не короче.' + ref('z56', 'ст. 56 п. 1') +
        (r.days ? ' Дни считаются календарные, вместе с выходными.' + ref('z13', 'ст. 13 п. 4') : '') + '</li>');
    }
    if (r.endShifted.length) {
      var why = r.endShifted.map(function (s) { return short(s.date) + ' — ' + esc(lowerFirst(s.reason)); }).join('; ');
      notes.push('<li class="note">Через ' + periodText(r.months, r.days) + ' получилось ' + short(r.nominalEnd) +
        ', но это нерабочий день, поэтому срок переносится на первый рабочий день (' + why + ').' + ref('z13', 'ст. 13 п. 5') + '</li>');
    }
    if (r.noSuchDay) {
      notes.push('<li class="note">В нужном месяце нет ' + +r.noticeDate.slice(8, 10) + '-го числа, поэтому отсчёт идёт от последнего дня месяца.' + ref('z13', 'ст. 13 п. 4') + '</li>');
    }
    if (r.paymentDaysOff.length) {
      notes.push('<li class="note">При подсчёте трёх рабочих дней пропущены: ' +
        r.paymentDaysOff.map(function (s) { return short(s.date) + ' (' + esc(lowerFirst(s.reason)) + ')'; }).join(', ') + '.</li>');
    }
    notes.push('<li class="note">Мы считаем, что договор прекращается в день окончания срока уведомления. Точную дату укажет приказ работодателя.</li>');
    return notes;
  }

  /* ---------- Выбор срока: кнопки + «Свой срок» ---------- */
  function Period(root) {
    var radios = root.querySelectorAll('input[type="radio"]');
    var row = root.querySelector('.period__row');
    var mi = root.querySelector('[data-f="months"]');
    var di = root.querySelector('[data-f="days"]');
    function selected() {
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
      return '1';
    }
    function apply(focus) {
      var v = selected();
      if (v === 'custom') {
        row.hidden = false;
        if (focus) mi.focus();
      } else {
        row.hidden = true;
        mi.value = v;
        di.value = '0';
      }
    }
    Array.prototype.forEach.call(radios, function (p) { p.addEventListener('change', function () { apply(true); }); });
    apply(false);
    return {
      value: function () { return [toCount(mi.value), toCount(di.value)]; },
      isCustomRadio: function (el) { return el.type === 'radio' && el.value === 'custom'; },
      reset: function () { radios[0].checked = true; apply(false); }
    };
  }

  /* ---------- Режимы калькулятора ---------- */
  var panels = {};
  function panel(mode) { return document.getElementById('panel-' + mode); }

  function setupMode(mode, run) {
    var root = panel(mode);
    var form = root.querySelector('form');
    var out = root.querySelector('.result');
    var m = { root: root, form: form, out: out, run: run, period: null };
    var pr = root.querySelector('[data-period]');
    if (pr) m.period = Period(pr);
    form.addEventListener('submit', function (e) { e.preventDefault(); run(m); });
    // Результат уже показан — пересчитываем при изменении значений (кроме выбора «Свой срок» до ввода чисел)
    form.addEventListener('change', function (e) {
      if (m.period && m.period.isCustomRadio(e.target)) return;
      if (out.innerHTML) run(m);
    });
    panels[mode] = m;
    return m;
  }
  function val(id) { return document.getElementById(id).value; }

  // Режим 1: последний день
  function runLast(m) {
    var p = m.period.value();
    var r = C.calculate(val('notice'), p[0], p[1]);
    if (!r.ok) { m.out.innerHTML = errorHtml(r, 'Укажите дату подачи уведомления.'); return; }
    var html = '<ol class="timeline">' +
      tl(0, 'Вы подали уведомление', fmt(r.noticeDate), 'Отсчёт срока — со следующего дня, ' + short(r.countStart) + '.' + ref('z13', 'ст. 13 п. 3')) +
      tl(1, 'Последний день: срок уведомления истекает', fmt(r.noticeEnd),
        'С этого дня вы вправе прекратить работу; в день прекращения договора выдаётся документ о трудовой деятельности. До этого дня уведомление можно отозвать.' + ref('z56', 'ст. 56 пп. 4–5') + ref('z62', 'ст. 62'), 'main') +
      tl(2, 'Окончательный расчёт — не позднее', fmt(r.paymentDeadline), 'Три рабочих дня после прекращения договора. За задержку положена пеня.' + ref('z113', 'ст. 113 п. 4')) +
      '</ol>';
    m.out.innerHTML = html + list(periodNotes(r), 3);
  }

  // Режим 2: когда подать
  function leftText(n) {
    if (n === 0) return 'Подать уведомление нужно сегодня.';
    var word = plural(n, 'день', 'дня', 'дней');
    var verb = (n % 10 === 1 && n % 100 !== 11) ? 'Остался ' : 'Осталось ';
    return verb + n + ' ' + word + ' до этой даты.';
  }
  function runWhen(m) {
    var p = m.period.value();
    var r = C.latestNotice(val('want'), p[0], p[1]);
    if (!r.ok) { m.out.innerHTML = errorHtml(r, 'Укажите желаемый последний день.'); return; }
    var today = todayIso();
    var past = r.noticeDate < today;
    var note1 = 'Срок уведомления считается со следующего дня.' + ref('z13', 'ст. 13') + ref('z56', 'ст. 56 п. 1');
    if (!past) note1 += ' ' + leftText(C.diffDays(today, r.noticeDate));
    var html = '<ol class="timeline">' +
      tl(0, 'Подайте уведомление не позднее', fmt(r.noticeDate), note1, 'main') +
      tl(1, 'Срок уведомления истечёт', fmt(r.noticeEnd), 'С этого дня вы вправе прекратить работу.' + ref('z56', 'ст. 56 п. 5')) +
      tl(2, 'Расчёт — не позднее', fmt(r.paymentDeadline), 'Три рабочих дня после прекращения договора.' + ref('z113', 'ст. 113 п. 4')) +
      '</ol>';
    var notes = [];
    if (past) {
      notes.push('<li class="note note--warn">Этот день уже прошёл. Уйти раньше срока можно только с письменного согласия работодателя.' + ref('z56', 'ст. 56 п. 2') + '</li>');
    }
    if (!r.exact) {
      notes.push('<li class="note">Ровно к ' + fmt(r.wantedLastDay) + ' не получится из-за выходных и праздников: при подаче ' +
        fmt(r.noticeDate) + ' срок истечёт ' + fmt(r.noticeEnd) + '.</li>');
    }
    m.out.innerHTML = html + list(notes.concat(periodNotes(r)), 3);
  }

  // Режим 3: деньги и документы
  function runDocs(m) {
    var r = C.documents(val('term'), val('req') || undefined);
    if (!r.ok) { m.out.innerHTML = errorHtml(r, 'Укажите последний день — дату прекращения договора.'); return; }
    var html = '<ol class="timeline">' +
      tl(0, 'Документ о трудовой деятельности — в день прекращения', fmt(r.workDocument), 'Выдаётся в день прекращения трудового договора.' + ref('z62', 'ст. 62 п. 1')) +
      tl(1, 'Все выплаты — не позднее', fmt(r.paymentDeadline),
        'Три рабочих дня после прекращения договора. Компенсация за неиспользованный отпуск входит в выплаты. За задержку положена пеня.' + ref('z113', 'ст. 113 п. 4') + ref('z96', 'ст. 96 п. 2'), 'main') +
      tl(2, 'Копия приказа — не позднее', fmt(r.orderCopyDeadline), 'Считаем, что приказ издан в день прекращения.' + ref('z61', 'ст. 61 п. 3')) +
      tl(3, 'Справка с места работы — не позднее', fmt(r.certificateDeadline),
        'По вашему запросу, 5 рабочих дней со дня обращения (' + short(r.requestDate) + ').' + ref('z62', 'ст. 62 п. 2')) +
      '</ol>';
    var notes = [];
    if (r.terminationOnDayOff) {
      notes.push('<li class="note note--warn">' + short(r.terminationDate) + ' — нерабочий день (' + esc(lowerFirst(r.terminationOnDayOff)) +
        '). Рабочие дни для сроков ниже отсчитываем от этой даты.</li>');
    }
    notes.push('<li class="note">Рабочие дни считаем для пятидневки, без выходных и праздников РК.</li>');
    m.out.innerHTML = html + list(notes, 4);
  }

  // Режим 4: если не заплатили
  function runUnpaid(m) {
    var r = C.unpaid(val('uterm'), val('utoday'));
    if (!r.ok) { m.out.innerHTML = errorHtml(r, 'Укажите дату прекращения договора и сегодняшнюю дату.'); return; }
    var overdue = r.isOverdue
      ? r.overdueDays + ' ' + plural(r.overdueDays, 'календарный день', 'календарных дня', 'календарных дней')
      : 'просрочки пока нет';
    var html = '<ol class="timeline">' +
      tl(0, 'Крайний срок выплаты', fmt(r.paymentDeadline), 'Три рабочих дня после прекращения договора.' + ref('z113', 'ст. 113 п. 4')) +
      tl(1, 'Просрочка на ' + fmt(r.today, false), overdue, r.isOverdue ? 'За задержку положена пеня (сумму калькулятор не считает).' + ref('z113', 'ст. 113 п. 4') : '') +
      tl(2, 'Обратиться в согласительную комиссию или суд — до', fmt(r.applyBy),
        'Один год с того дня, когда работник узнал о нарушении.' + ref('z160', 'ст. 160') +
        ' Сначала согласительная комиссия, а у небольших работодателей (до 15 работников) — сразу суд.' + ref('z159', 'ст. 159'), 'main') +
      '</ol>';
    var notes = [];
    if (r.applyMissed) {
      notes.push('<li class="note note--warn">Срок обращения, вероятно, пропущен. Согласительная комиссия может восстановить его по уважительной причине.' + ref('z160', 'ст. 160') + '</li>');
    }
    notes.push('<li class="note">Считаем, что о нарушении вы узнали ' + fmt(r.learnedOn) + ', на следующий день после срока выплаты.</li>');
    if (!r.applyByShiftChecked) {
      notes.push('<li class="note note--warn">Если этот день окажется выходным, срок переносится на следующий рабочий день.' + ref('z13', 'ст. 13 п. 5') +
        ' Календарь праздников на 2028 год в калькуляторе не заведён.</li>');
    }
    notes.push('<li class="note">За просрочку выплат положена пеня.' + ref('z113', 'ст. 113 п. 4') + ' Куда обратиться — в разделе <a href="#contacts">«Контакты»</a>.</li>');
    m.out.innerHTML = html + list(notes, 3);
  }

  setupMode('last', runLast);
  setupMode('when', runWhen);
  setupMode('docs', runDocs);
  setupMode('unpaid', runUnpaid);

  // Поля дат: границы по календарю и значения по умолчанию
  var td = todayIso();
  [['notice', clamp(td)], ['want', clamp(C.addMonths(td, 1))], ['term', clamp(td)], ['uterm', clamp(td)]].forEach(function (a) {
    var el = document.getElementById(a[0]);
    el.min = C.CALENDAR_FROM; el.max = C.CALENDAR_TO; el.value = a[1];
  });
  var reqEl = document.getElementById('req'); reqEl.min = C.CALENDAR_FROM; reqEl.max = C.CALENDAR_TO;
  var todayEl = document.getElementById('utoday'); todayEl.min = C.CALENDAR_FROM; todayEl.value = td < C.CALENDAR_FROM ? C.CALENDAR_FROM : td;

  /* ---------- Вкладки ---------- */
  var order = ['last', 'when', 'docs', 'unpaid'];
  var tabEls = order.map(function (k) { return document.getElementById('tab-' + k); });
  var tablist = document.getElementById('tabs');
  var pill = document.getElementById('pill');
  var cur = 0, token = 0;

  // Пилюля переезжает под выбранную вкладку: позиция и размер — из реальных размеров кнопки
  function placePill(instant) {
    var t = tabEls[cur];
    if (instant) pill.classList.add('no-anim');
    pill.style.width = t.offsetWidth + 'px';
    pill.style.height = t.offsetHeight + 'px';
    pill.style.transform = 'translate(' + t.offsetLeft + 'px,' + t.offsetTop + 'px)';
    if (instant) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
    pill.classList.add('is-ready');
  }

  function selectTab(idx, focus) {
    if (idx === cur) { if (focus) tabEls[idx].focus(); return; }
    var oldPanel = panel(order[cur]);
    var newPanel = panel(order[idx]);
    cur = idx;
    var my = ++token;
    tabEls.forEach(function (t, i) {
      t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      t.tabIndex = i === idx ? 0 : -1;
    });
    placePill(false);
    if (focus) tabEls[idx].focus();
    // Убираем всё лишнее, что могло остаться от быстрых переключений
    order.forEach(function (k) {
      var p = panel(k);
      if (p !== oldPanel && p !== newPanel) { p.hidden = true; p.classList.remove('is-leaving'); }
    });
    if (reduced()) { oldPanel.hidden = true; oldPanel.classList.remove('is-leaving'); newPanel.hidden = false; return; }
    oldPanel.classList.add('is-leaving');
    newPanel.hidden = true;
    setTimeout(function () {
      if (my !== token) return;
      oldPanel.hidden = true;
      oldPanel.classList.remove('is-leaving');
      newPanel.hidden = false;
    }, 200);
  }

  tabEls.forEach(function (t, i) { t.addEventListener('click', function () { selectTab(i, false); }); });
  tablist.addEventListener('keydown', function (e) {
    var i = tabEls.indexOf(document.activeElement);
    if (i < 0) return;
    var n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabEls.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + tabEls.length - 1) % tabEls.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabEls.length - 1;
    if (n === null) return;
    e.preventDefault();
    selectTab(n, true);
  });
  placePill(true);
  if (window.ResizeObserver) new ResizeObserver(function () { placePill(true); }).observe(tablist);
  else window.addEventListener('resize', function () { placePill(true); });
  window.addEventListener('load', function () { placePill(true); });

  // Кнопки «Посчитать этот пример»: режим «Последний день», срок по закону
  Array.prototype.forEach.call(document.querySelectorAll('[data-try]'), function (b) {
    b.addEventListener('click', function () {
      selectTab(0, false);
      document.getElementById('notice').value = b.getAttribute('data-try');
      panels.last.period.reset();
      runLast(panels.last);
      document.getElementById('calc').scrollIntoView();
      document.getElementById('notice').focus({ preventScroll: true });
    });
  });

  /* ---------- Тема: авто → светлая → тёмная ---------- */
  var themeBtn = document.getElementById('theme');
  var themeTxt = document.getElementById('theme-txt');
  var root = document.documentElement;
  var metaScheme = document.querySelector('meta[name="color-scheme"]');
  var THEMES = ['auto', 'light', 'dark'];
  var LABELS = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
  var NAMES = { auto: 'авто (как в системе)', light: 'светлая', dark: 'тёмная' };
  var theme = 'auto';
  try { var saved = localStorage.getItem('ld-theme'); if (saved === 'light' || saved === 'dark') theme = saved; } catch (e) {}

  function applyTheme() {
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    if (metaScheme) metaScheme.setAttribute('content', theme === 'auto' ? 'light dark' : theme);
    themeBtn.setAttribute('data-mode', theme);
    themeTxt.textContent = LABELS[theme];
    var next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    themeBtn.setAttribute('aria-label', 'Тема оформления: ' + NAMES[theme] + '. Переключить на: ' + NAMES[next]);
    themeBtn.title = 'Тема: ' + NAMES[theme];
  }
  var fadeTimer;
  themeBtn.addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    if (!reduced()) {
      root.classList.add('theme-fade');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { root.classList.remove('theme-fade'); }, 420);
    }
    applyTheme();
    try { if (theme === 'auto') localStorage.removeItem('ld-theme'); else localStorage.setItem('ld-theme', theme); } catch (e) {}
  });
  applyTheme();

  /* ---------- Подсветка раздела в навигации ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav a'));
  function setActive(id) {
    navLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      if (on) { a.setAttribute('aria-current', 'true'); } else { a.removeAttribute('aria-current'); }
      if (on) { // прокручиваем только саму ленту навигации, не страницу
        var nav = a.parentNode;
        if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
      }
    });
  }
  if ('IntersectionObserver' in window) {
    var sections = ['calc', 'explain', 'sources', 'contacts'].map(function (id) { return document.getElementById(id); });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-35% 0px -60% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Мягкое появление разделов при прокрутке ---------- */
  if ('IntersectionObserver' in window && !reduced()) {
    var targets = document.querySelectorAll('#explain .wrap > *, #sources .wrap > *, #contacts .wrap > *, .foot .wrap');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('reveal'); io.observe(el); });
  }
})();
