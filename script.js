(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Шапка, мобильное меню и баннер cookie — в common.js (общий для всех страниц)

  /* ---------- Видео: грузим и играем, только когда оно рядом с экраном ---------- */
  const video = $('.visit__video');
  if (video) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!video.src) { video.src = video.dataset.src; video.preload = 'auto'; }
        video.play().catch(() => {});
      } else if (video.src) {
        video.pause();
      }
    }, { rootMargin: '300px 0px' }).observe(video);
  }

  /* ---------- Появление блоков ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- Счётчик врачей ---------- */
  $$('.counter[data-count]').forEach(el => {
    const target = +el.dataset.count;
    el.textContent = '1';
    const run = () => {
      const start = performance.now(), dur = 1600;
      const tick = now => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = Math.max(1, Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    new IntersectionObserver((en, o) => {
      if (en[0].isIntersecting) { setTimeout(run, 400); o.disconnect(); }
    }).observe(el);
  });

  /* ---------- Первый визит: шаги загораются по скроллу ---------- */
  // Сплошная линия от центра первого кружка до центра последнего.
  // Заполнение следует за скроллом с плавной интерполяцией, кружки
  // загораются, когда линия до них доходит.
  const stepsEl = $('#steps');
  if (stepsEl) {
    const steps = $$('.step', stepsEl);
    const nums = steps.map(s => $('.step__num', s));
    const track = document.createElement('span');
    track.className = 'steps__track';
    track.innerHTML = '<span class="steps__fill"></span><span class="steps__dot"></span>';
    stepsEl.prepend(track);

    let centers = [], top = 0, height = 1, target = 0, shown = 0;
    const layout = () => {
      centers = nums.map(n => n.offsetTop + n.closest('.step').offsetTop + n.offsetHeight / 2);
      top = centers[0];
      height = Math.max(1, centers[centers.length - 1] - top);
      track.style.top = top + 'px';
      track.style.height = height + 'px';
    };
    const measure = () => {
      const mark = window.innerHeight * 0.58;                 // «линия чтения» на экране
      const r = stepsEl.getBoundingClientRect();
      target = Math.max(0, Math.min(1, (mark - (r.top + top)) / height));
    };
    const tick = () => {
      shown += (target - shown) * 0.12;
      if (Math.abs(target - shown) < 0.0005) shown = target;
      track.style.setProperty('--p', shown.toFixed(4));
      track.style.setProperty('--dot', shown > 0.01 && shown < 0.99 ? 1 : 0);
      steps.forEach((s, i) => {
        const reached = (shown > 0.0005 || target > 0) && (centers[i] - top) / height <= shown + 0.001;
        if (reached !== s.classList.contains('is-active')) s.classList.toggle('is-active', reached);
      });
      requestAnimationFrame(tick);
    };
    layout();
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', () => { layout(); measure(); });
    document.fonts && document.fonts.ready.then(() => { layout(); measure(); });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.addEventListener('scroll', () => { shown = target; }, { passive: true });
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Отзывы: бесконечная лента ---------- */
  $$('.marquee__track').forEach(track => {
    track.innerHTML += track.innerHTML; // дубль для бесшовной прокрутки
    $$('.review', track).slice(track.children.length / 2).forEach(el => el.setAttribute('aria-hidden', 'true'));
    const dir = track.dataset.dir === 'right' ? 1 : -1;
    let x = dir === 1 ? -track.scrollWidth / 2 : 0;
    let paused = false;
    const speed = 0.35;
    track.parentElement.addEventListener('mouseenter', () => { paused = true; });
    track.parentElement.addEventListener('mouseleave', () => { paused = false; });
    const loop = () => {
      if (!paused) {
        const half = track.scrollWidth / 2;
        x += speed * dir;
        if (x <= -half) x += half;
        if (x >= 0) x -= half;
        track.style.transform = `translate3d(${x}px,0,0)`;
      }
      requestAnimationFrame(loop);
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(loop);
  });

  /* ---------- Подвал: бегущая строка логотипов ---------- */
  // Движение через rAF: при наведении скорость плавно падает, без скачка позиции.
  const ticker = $('.footer__ticker');
  if (ticker && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const track = $('.footer__track', ticker);
    const base = 60;                 // px в секунду
    let x = 0, speed = base, target = base, last = performance.now(), visible = true;
    ticker.addEventListener('pointerenter', () => { target = base * 0.25; });
    ticker.addEventListener('pointerleave', () => { target = base; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(ticker);
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        speed += (target - speed) * Math.min(1, dt * 3);
        const loop = track.scrollWidth / 3;     // ширина одного логотипа
        x -= speed * dt;
        if (-x >= loop) x += loop;
        track.style.transform = `translate3d(${x}px,0,0)`;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Форма записи ---------- */
  const phone = $('#phone');
  const formatPhone = v => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
    d = d.slice(0, 10);
    const t = '(___) ___-__-__'.split('');
    let k = 0;
    for (let i = 0; i < t.length && k < d.length; i++) if (t[i] === '_') t[i] = d[k++];
    return { text: '+7 ' + t.join(''), digits: d };
  };
  phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+7 '; });
  phone.addEventListener('blur', () => { if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''; });
  phone.addEventListener('input', () => {
    const { text, digits } = formatPhone(phone.value);
    const filled = text.slice(0, text.search(/_|$/));
    phone.value = digits.length ? filled.replace(/[\s()-]+$/, '') : '+7 ';
  });

  /* ---------- Выпадающий список в стиле сайта ---------- */
  $$('.select').forEach(sel => {
    const btn = $('.select__btn', sel);
    const list = $('.select__list', sel);
    const input = $('input[type=hidden]', sel);
    const value = $('.select__value', sel);
    const opts = $$('.select__opt', sel);
    let active = Math.max(0, opts.findIndex(o => o.getAttribute('aria-selected') === 'true'));

    const highlight = i => {
      active = (i + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle('is-active', k === active));
      opts[active].scrollIntoView({ block: 'nearest' });
    };
    const open = () => {
      sel.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      highlight(active);
    };
    const close = () => {
      sel.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const choose = i => {
      opts.forEach(o => o.setAttribute('aria-selected', 'false'));
      opts[i].setAttribute('aria-selected', 'true');
      value.textContent = opts[i].textContent;
      input.value = opts[i].textContent;
      active = i;
      close();
      btn.focus();
    };

    btn.addEventListener('click', () => (sel.classList.contains('is-open') ? close() : open()));
    opts.forEach((o, i) => {
      o.addEventListener('click', () => choose(i));
      o.addEventListener('pointermove', () => highlight(i));
    });
    sel.addEventListener('keydown', e => {
      const isOpen = sel.classList.contains('is-open');
      if (e.key === 'ArrowDown') { e.preventDefault(); isOpen ? highlight(active + 1) : open(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); isOpen ? highlight(active - 1) : open(); }
      else if ((e.key === 'Enter' || e.key === ' ') && isOpen) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('pointerdown', e => { if (!sel.contains(e.target)) close(); });
    // при прокрутке страницы список не должен «висеть» поверх контента
    let openY = 0;
    btn.addEventListener('click', () => { openY = window.scrollY; });
    window.addEventListener('scroll', () => {
      if (sel.classList.contains('is-open') && Math.abs(window.scrollY - openY) > 60) close();
    }, { passive: true });
  });

  const form = $('#form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.elements.name;
    const okName = name.value.trim().length > 1;
    const okPhone = phone.value.replace(/\D/g, '').length === 11;
    const consent = form.elements.consent;
    const okConsent = consent.checked;
    name.closest('.field').classList.toggle('is-error', !okName);
    phone.closest('.field').classList.toggle('is-error', !okPhone);
    consent.closest('.consent').classList.toggle('is-error', !okConsent);
    if (!okName || !okPhone || !okConsent) return;
    // Здесь можно отправить заявку на сервер / в Telegram.
    form.classList.add('is-sent');
    form.reset();
  });
  $$('.field input', form).forEach(i => i.addEventListener('input', () => i.closest('.field').classList.remove('is-error')));
  form.elements.consent.addEventListener('change', e => e.target.closest('.consent').classList.remove('is-error'));
})();
