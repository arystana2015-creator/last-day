/* Связывает форму на странице с расчётом из calc.js. Ничего не сохраняет и не отправляет. */
(function () {
  'use strict';
  var C = window.LastDay;
  var TK = 'https://adilet.zan.kz/rus/docs/K1500000414';

  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  function fmt(iso, withWeekday) {
    var s = +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
    return withWeekday === false ? s : s + ', ' + WEEKDAYS[C.weekday(iso)];
  }
  function short(iso) { return +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1]; }
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

  var form = document.getElementById('form');
  var notice = document.getElementById('notice');
  var months = document.getElementById('months');
  var days = document.getElementById('days');
  var out = document.getElementById('result');

  // Допустимый период ввода — тот, на который заведён календарь праздников.
  notice.min = C.CALENDAR_FROM;
  notice.max = C.CALENDAR_TO;
  var today = new Date();
  var todayIso = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);
  notice.value = todayIso < C.CALENDAR_FROM ? C.CALENDAR_FROM : (todayIso > C.CALENDAR_TO ? C.CALENDAR_TO : todayIso);

  var ERRORS = {
    'invalid-date': 'Укажите дату подачи уведомления.',
    'invalid-period': 'Укажите срок целыми числами: месяцев от 0 до 24, дней от 0 до 730, хотя бы одно значение больше нуля.',
    'too-short': 'По закону работник предупреждает работодателя не менее чем за один месяц (ст. 56 п. 1 ТК РК). Более короткий срок — только в особом случае из п. 3 этой статьи, его калькулятор не считает.',
    'before-calendar': 'Калькулятор считает даты начиная с 1 июля 2026 года: с этого дня действует новый список праздников.',
    'after-calendar': 'Результат выходит за 31 декабря 2027 года, а календарь праздников заведён только до этой даты. Сверьтесь с производственным календарём.'
  };

  function render(r) {
    if (!r.ok) {
      out.innerHTML = '<p class="error" role="alert">' + esc(ERRORS[r.error] || 'Не удалось рассчитать.') + '</p>';
      return;
    }
    var html = '<ol class="timeline">' +
      '<li class="tl" style="--i:0"><span class="tl__mark" aria-hidden="true"></span>' +
        '<p class="tl__label">Вы подали уведомление</p>' +
        '<p class="tl__date">' + fmt(r.noticeDate) + '</p>' +
        '<p class="tl__note">Отсчёт срока — со следующего дня, ' + short(r.countStart) + '.' + ref('z13', 'ст. 13 п. 3') + '</p></li>' +
      '<li class="tl tl--main" style="--i:1"><span class="tl__mark" aria-hidden="true"></span>' +
        '<p class="tl__label">Последний день: срок уведомления истекает</p>' +
        '<p class="tl__date">' + fmt(r.noticeEnd) + '</p>' +
        '<p class="tl__note">С этого дня вы вправе прекратить работу; в день прекращения договора выдаётся документ о трудовой деятельности. До этого дня уведомление можно отозвать.' + ref('z56', 'ст. 56 пп. 4–5') + ref('z62', 'ст. 62') + '</p></li>' +
      '<li class="tl" style="--i:2"><span class="tl__mark" aria-hidden="true"></span>' +
        '<p class="tl__label">Окончательный расчёт — не позднее</p>' +
        '<p class="tl__date">' + fmt(r.paymentDeadline) + '</p>' +
        '<p class="tl__note">Три рабочих дня после прекращения договора. За задержку положена пеня.' + ref('z113', 'ст. 113 п. 4') + '</p></li>' +
      '</ol>';

    var notes = [];
    if (r.noticeOnDayOff) {
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

    out.innerHTML = html + '<ul class="notes" style="--i:3">' + notes.join('') + '</ul>';
  }

  function run() { render(C.calculate(notice.value, toCount(months.value), toCount(days.value))); }

  form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

  // Кнопки «Посчитать этот пример»
  Array.prototype.forEach.call(document.querySelectorAll('[data-try]'), function (b) {
    b.addEventListener('click', function () {
      notice.value = b.getAttribute('data-try');
      months.value = b.getAttribute('data-months') || '1';
      days.value = '0';
      run();
      document.getElementById('calc').scrollIntoView();
      notice.focus({ preventScroll: true });
    });
  });
})();
