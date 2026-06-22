import './index.css';

type Icon = 'copy' | 'check' | 'arrow-up' | 'code';
type Page = { title: string; slug: string; href: string; path: string };

const sourceUrl = 'https://github.com/injaneity/injaneity';
const $ = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);

function icon(name: Icon) {
  const paths = {
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    'arrow-up': '<path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path>',
    code: '<path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function initSearch() {
  const root = $<HTMLElement>('[data-search]');
  const input = $<HTMLInputElement>('[data-search-input]', root ?? document);
  const panel = $<HTMLElement>('[data-search-results]', root ?? document);
  const list = $<HTMLElement>('[data-search-list]', root ?? document);
  if (!root || !input || !panel || !list) return;

  const pages = JSON.parse($('#search-index')?.textContent || '[]') as Page[];
  const updateScrollHints = () => {
    panel.classList.toggle('can-scroll-up', list.scrollTop > 2);
    panel.classList.toggle('can-scroll-down', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  };
  const resultButton = (page: Page) => {
    const button = document.createElement('button');
    const title = document.createElement('span');
    const file = document.createElement('span');
    button.type = 'button';
    button.className = 'search-result';
    title.className = 'search-title';
    file.className = 'search-path';
    title.textContent = page.title;
    file.textContent = `${page.slug}.md`;
    button.append(title, file);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      location.href = page.href;
    });
    return button;
  };
  const render = () => {
    const query = input.value.trim().toLowerCase();
    const visible = query ? pages.filter((page) => [page.title, page.slug, page.path].some((value) => value.toLowerCase().includes(query))) : pages;
    list.replaceChildren(...visible.map(resultButton));
    panel.hidden = !(root.contains(document.activeElement) && visible.length);
    updateScrollHints();
  };

  root.addEventListener('focusin', render);
  root.addEventListener('focusout', () => setTimeout(render, 160));
  input.addEventListener('input', render);
  list.addEventListener('scroll', updateScrollHints);
  $('[data-search-button]', root)?.addEventListener('click', () => input.focus());
  $('[data-search-clear]', root)?.addEventListener('mousedown', (event) => {
    event.preventDefault();
    input.value = '';
    input.focus();
    render();
  });
  render();
}

function initCornerButton() {
  const button = $<HTMLButtonElement>('[data-corner-button]');
  const label = $<HTMLElement>('[data-corner-label]');
  const iconSlot = $<HTMLElement>('[data-corner-icon]');
  if (!button || !label || !iconSlot) return;

  const update = () => {
    const top = scrollY > 300;
    button.dataset.mode = top ? 'top' : 'source';
    button.ariaLabel = top ? 'Back to top' : 'View source code';
    label.textContent = top ? 'Return to top' : 'view source code';
    iconSlot.innerHTML = icon(top ? 'arrow-up' : 'code');
  };

  button.addEventListener('click', () => button.dataset.mode === 'top' ? scrollTo({ top: 0, behavior: 'smooth' }) : open(sourceUrl, '_blank', 'noopener,noreferrer'));
  addEventListener('scroll', update, { passive: true });
  update();
}

function initCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-code]').forEach((button) => {
    button.innerHTML = icon('copy');
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? '');
      button.innerHTML = icon('check');
      setTimeout(() => { button.innerHTML = icon('copy'); }, 2000);
    });
  });
}

function initShader() {
  const canvas = $<HTMLCanvasElement>('.eink-overlay');
  const gl = canvas?.getContext('webgl', { antialias: false, depth: false });
  if (!canvas || !gl) return;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}');
  const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;uniform vec2 u_resolution;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}void main(){vec2 uv=gl_FragCoord.xy/u_resolution;float grain=hash(gl_FragCoord.xy);float fibre=noise(gl_FragCoord.xy*vec2(0.9,0.18));float mottle=noise(gl_FragCoord.xy*0.012);float paper=1.0-0.035*grain-0.030*fibre-0.025*mottle;float d=distance(uv,vec2(0.5));paper*=1.0-0.06*smoothstep(0.45,0.95,d);gl_FragColor=vec4(vec3(paper),1.0);}`);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'a_position'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'a_position'), 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, 'u_resolution');
  const render = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  addEventListener('resize', render, { passive: true });
  render();
}

addEventListener('DOMContentLoaded', () => [initSearch, initCornerButton, initCopyButtons, initShader].forEach((init) => init()));
