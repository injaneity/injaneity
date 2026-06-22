import './index.css';

const SEARCH_OPEN_CLASS = 'is-open';
const SOURCE_URL = 'https://github.com/injaneity/injaneity';

interface PageMetadata {
  title: string;
  slug: string;
  href: string;
  path: string;
}

function getPages(): PageMetadata[] {
  const node = document.getElementById('search-index');
  if (!node?.textContent) return [];
  try {
    return JSON.parse(node.textContent) as PageMetadata[];
  } catch {
    return [];
  }
}

function icon(name: 'search' | 'x' | 'copy' | 'check' | 'arrow-up' | 'code') {
  const paths = {
    search: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    'arrow-up': '<path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path>',
    code: '<path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path>',
  };

  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function initSearch() {
  const root = document.querySelector<HTMLElement>('[data-search]');
  const input = root?.querySelector<HTMLInputElement>('[data-search-input]');
  const results = root?.querySelector<HTMLElement>('[data-search-results]');
  const clear = root?.querySelector<HTMLButtonElement>('[data-search-clear]');
  const list = root?.querySelector<HTMLElement>('[data-search-list]');
  if (!root || !input || !results || !clear || !list) return;

  const pages = getPages();
  let focused = false;

  const updateScrollHints = () => {
    results.classList.toggle('can-scroll-up', list.scrollTop > 2);
    results.classList.toggle('can-scroll-down', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const visible = query
      ? pages.filter((page) => [page.title, page.slug, page.path].some((value) => value.toLowerCase().includes(query)))
      : pages;

    list.replaceChildren(...visible.map((page) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.innerHTML = `<span class="search-title">${escapeHtml(page.title)}</span><span class="search-path">${escapeHtml(page.slug)}.md</span>`;
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        window.location.href = page.href;
      });
      return button;
    }));

    const open = root.matches(':hover') || focused || input.value.length > 0;
    root.classList.toggle(SEARCH_OPEN_CLASS, open);
    results.hidden = !(focused && visible.length > 0);
    clear.hidden = input.value.length === 0;
    updateScrollHints();
  };

  root.addEventListener('mouseenter', render);
  root.addEventListener('mouseleave', render);
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { focused = true; render(); });
  input.addEventListener('blur', () => window.setTimeout(() => { focused = false; render(); }, 160));
  list.addEventListener('scroll', updateScrollHints);
  clear.addEventListener('mousedown', (event) => {
    event.preventDefault();
    input.value = '';
    input.focus();
    render();
  });
  root.querySelector('[data-search-button]')?.addEventListener('click', () => input.focus());
  render();
}

function initCornerButton() {
  const button = document.querySelector<HTMLButtonElement>('[data-corner-button]');
  const label = button?.querySelector<HTMLElement>('[data-corner-label]');
  if (!button || !label) return;

  const update = () => {
    const showTop = window.scrollY > 300;
    button.dataset.mode = showTop ? 'top' : 'source';
    button.setAttribute('aria-label', showTop ? 'Back to top' : 'View source code');
    label.textContent = showTop ? 'Return to top' : 'view source code';
    button.querySelector('[data-corner-icon]')!.innerHTML = showTop ? icon('arrow-up') : icon('code');
  };

  button.addEventListener('click', () => {
    if (button.dataset.mode === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else window.open(SOURCE_URL, '_blank', 'noopener,noreferrer');
  });
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-code]').forEach((button) => {
    button.innerHTML = icon('copy');
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? '';
      let ok = false;
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        ok = document.execCommand('copy');
        textarea.remove();
      }
      if (!ok) return;
      button.innerHTML = icon('check');
      window.setTimeout(() => { button.innerHTML = icon('copy'); }, 2000);
    });
  });
}

function initShader() {
  const canvas = document.querySelector<HTMLCanvasElement>('.eink-overlay');
  const gl = canvas?.getContext('webgl', { antialias: false, depth: false });
  if (!canvas || !gl) return;

  const vertexSource = 'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}';
  const fragmentSource = `precision mediump float;uniform vec2 u_resolution;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}void main(){vec2 uv=gl_FragCoord.xy/u_resolution;float grain=hash(gl_FragCoord.xy);float fibre=noise(gl_FragCoord.xy*vec2(0.9,0.18));float mottle=noise(gl_FragCoord.xy*0.012);float paper=1.0-0.035*grain-0.030*fibre-0.025*mottle;float d=distance(uv,vec2(0.5));paper*=1.0-0.06*smoothstep(0.45,0.95,d);gl_FragColor=vec4(vec3(paper),1.0);}`;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, 'u_resolution');

  const render = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  window.addEventListener('resize', render, { passive: true });
  render();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initCornerButton();
  initCopyButtons();
  initShader();
});
