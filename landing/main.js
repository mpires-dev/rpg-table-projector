/* =========================================================================
   Combat Maps — landing
   ========================================================================= */

/**
 * ANTES DE PUBLICAR: aponte para onde os cadastros devem chegar.
 *
 * Enquanto estiver vazio, o formulário abre o cliente de e-mail do visitante com
 * a resposta já escrita — funciona de verdade, mas depende de ele apertar enviar.
 * Com um endpoint (Formspree, Getform, um Worker seu), o envio passa a ser direto
 * e silencioso.
 */
const ENDPOINT = '';
const EMAIL_FALLBACK = 'contato@combatmaps.com.br';

/* ------------------------------- topo ---------------------------------- */

const topbar = document.getElementById('topbar');

// A barra só ganha sombra depois que a página sai do topo — antes disso ela é
// parte do papel, não um elemento flutuando.
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 12);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------------------------- entrada suave ---------------------------- */

const revealables = document.querySelectorAll('.reveal');

for (const node of revealables) {
  const delay = node.dataset.delay;
  if (delay) node.style.setProperty('--d', delay);
}

if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
  for (const node of revealables) node.classList.add('in');
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px' }
  );
  for (const node of revealables) observer.observe(node);
}

/* ------------------------------ formulário ------------------------------ */

const form = document.getElementById('form');
const status = document.getElementById('status');
const emailField = document.getElementById('email');
const errEmail = document.getElementById('err-email');
const errPreco = document.getElementById('err-preco');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const email = String(data.get('email') || '').trim();
  const preco = data.get('preco');
  const perfil = data.get('perfil');

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  errEmail.hidden = emailOk;
  errPreco.hidden = Boolean(preco);

  if (!emailOk) {
    emailField.focus();
    return;
  }
  if (!preco) {
    form.querySelector('input[name="preco"]').focus();
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.classList.remove('ok');
  status.textContent = 'Enviando…';

  const payload = { email, perfil, preco, origem: 'landing', quando: new Date().toISOString() };

  try {
    if (ENDPOINT) {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      succeed();
    } else {
      // Sem endpoint: entrega pelo cliente de e-mail em vez de fingir que salvou.
      const assunto = encodeURIComponent('Lista de espera — Combat Maps');
      const corpo = encodeURIComponent(
        `E-mail: ${email}\nPerfil: ${perfil}\nSobre o preço de US$ 799: ${preco}\n`
      );
      location.href = `mailto:${EMAIL_FALLBACK}?subject=${assunto}&body=${corpo}`;
      status.textContent = 'Abrimos seu e-mail com a resposta pronta — é só enviar.';
      button.disabled = false;
    }
  } catch (error) {
    console.error(error);
    status.textContent = `Não conseguimos registrar agora. Escreva para ${EMAIL_FALLBACK} que anotamos na mão.`;
    button.disabled = false;
  }

  function succeed() {
    form.querySelectorAll('input').forEach((input) => {
      input.disabled = true;
    });
    status.classList.add('ok');
    status.textContent =
      'Pronto, você está na lista. Só escrevemos de novo quando a produção abrir.';
  }
});
