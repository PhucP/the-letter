'use strict';
// Edit this object to replace the sample letter. No service or build step needed.
const LETTER = {
  greeting: 'Gửi người bạn năm ấy,',
  message: 'Bạn còn nhớ không, ô cửa sổ ngập nắng, tiếng phấn chạm bảng và những buổi tan trường chẳng ai muốn về?\n\nCó những ngày đã đi xa, nhưng chỉ cần một cơn gió nhẹ, tất cả lại trở về — trong veo như mùa hạ đầu tiên.\n\nMong bạn, dù đang ở đâu, vẫn giữ trong tim một khoảng trời xanh như thế. Và đừng quên: luôn có một nơi gọi là ký ức, chờ bạn ghé thăm.',
  signature: 'Một người vẫn nhớ'
};
// Keep a pristine document for saving, rather than serializing an open dialog
// or an in-progress animation. User content is stored as inert JSON in HTML.
const HTML_TEMPLATE = document.documentElement.cloneNode(true);
try {
  const saved = JSON.parse(document.getElementById('letterConfig')?.textContent || '{}');
  for (const key of ['greeting','message','signature']) {
    if (typeof saved[key] === 'string') LETTER[key] = saved[key];
  }
} catch { /* An absent or invalid configuration keeps the default letter. */ }
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;
let state = 'intro', sequence = 0, typingFrame = 0, typingDone = false, returnFocus = null;
const delay = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? Math.min(ms, 80) : ms));
function setState(next) { state = next; body.dataset.state = next; $('clockTrigger').disabled = next !== 'explore'; }
function announce(message) { $('status').textContent = message; }
function setStep(index) { document.querySelectorAll('[data-step]').forEach(el => el.classList.toggle('active', Number(el.dataset.step) <= index)); }

// Gentle shared wind: every layer follows the same seven-second gust envelope.
let ambient = null, soundOn = false;
function audioContext() {
  if (!ambient) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const wind = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = wind.getChannelData(0); let previous = 0;
    for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = previous * 3; }
    const source = ctx.createBufferSource(); source.buffer = wind; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620;
    const windGain = ctx.createGain(); windGain.gain.value = .07;
    source.connect(filter); filter.connect(windGain); windGain.connect(master); source.start();
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 1 / 7; lfoGain.gain.value = .025; lfo.connect(lfoGain); lfoGain.connect(windGain.gain); lfo.start();
    ambient = {ctx, master};
    startBackgroundMusic(ctx, master);
  }
  return ambient;
}
// Original, quiet 68 BPM arpeggio. Scheduled against the audio clock so it
// pauses with the tab and never needs an external audio file or network.
function startBackgroundMusic(ctx, destination) {
  const bus = ctx.createGain(); bus.gain.value = .48; bus.connect(destination);
  const echo = ctx.createDelay(2), feedback = ctx.createGain(), wet = ctx.createGain();
  echo.delayTime.value = .441; feedback.gain.value = .22; wet.gain.value = .18;
  bus.connect(echo); echo.connect(feedback); feedback.connect(echo);
  echo.connect(wet); wet.connect(destination);
  const chords = [[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
  const melody = [76,null,79,76,74,null,72,null,72,76,74,null,71,null,67,null];
  let beat = 0, next = ctx.currentTime + .25;
  function note(midi, when, volume, duration) {
    const frequency = 440 * Math.pow(2,(midi-69)/12);
    for (const [ratio, level] of [[1,1],[2,.16]]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(volume * level, when + .035);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      osc.connect(gain); gain.connect(bus);
      osc.start(when); osc.stop(when + duration + .05);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  function schedule() {
    if (ctx.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + .05;
    while (next < ctx.currentTime + .6) {
      const chord = chords[Math.floor(beat / 8) % chords.length];
      note(chord[[0,2,1,3][beat % 4]], next, .075, 2.7);
      if (beat % 2 === 0) {
        const pitch = melody[Math.floor(beat / 2) % melody.length];
        if (pitch !== null) note(pitch, next, .042, 3.2);
      }
      beat++; next += 60 / 68;
    }
  }
  schedule(); ambient.musicTimer = setInterval(schedule, 200);
}
async function setSound(on) {
  try {
    const a = audioContext();
    if (!a) { announce('Trình duyệt này chưa hỗ trợ âm thanh.'); return; }
    await a.ctx.resume(); soundOn = on;
    a.master.gain.cancelScheduledValues(a.ctx.currentTime);
    a.master.gain.setTargetAtTime(on ? .65 : 0, a.ctx.currentTime, .25);
    body.classList.toggle('sound-on', on);
    $('soundToggle').setAttribute('aria-pressed', String(on));
    $('soundToggle').setAttribute('aria-label', on ? 'Tắt âm thanh' : 'Bật âm thanh');
    $('soundToggle').title = on ? 'Tắt âm thanh' : 'Bật âm thanh';
  } catch { announce('Chưa thể phát âm thanh. Bạn có thể thử nút âm thanh lần nữa.'); }
}
function chime(kind = 'lift') {
  if (!soundOn || !ambient) return;
  const {ctx, master} = ambient, now = ctx.currentTime;
  const notes = kind === 'open' ? [523.25,659.25,783.99,1046.5] : [659.25,987.77];
  notes.forEach((frequency, i) => {
    const osc = ctx.createOscillator(), g = ctx.createGain(), start = now + i * .12;
    osc.type = 'sine'; osc.frequency.value = frequency;
    g.gain.setValueAtTime(0,start); g.gain.linearRampToValueAtTime(.055,start+.025); g.gain.exponentialRampToValueAtTime(.0001,start+1.7);
    osc.connect(g); g.connect(master); osc.start(start); osc.stop(start+1.8);
  });
}
function paperSound(duration = .8) {
  if (!soundOn || !ambient) return;
  const {ctx, master} = ambient, now = ctx.currentTime;
  const b = ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(.3+.7*Math.abs(Math.sin(i/ctx.sampleRate*19)));
  const s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
  s.buffer=b; f.type='bandpass'; f.frequency.value=1800; f.Q.value=.6;
  g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(.11,now+.08); g.gain.exponentialRampToValueAtTime(.001,now+duration);
  s.connect(f);f.connect(g);g.connect(master);s.start();
}
function typingClick(character) {
  if (!soundOn || !ambient || ambient.ctx.state !== 'running' || /\s/.test(character)) return;
  const {ctx, master} = ambient;
  if (!ambient.keyBuffer) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .026), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .005));
    ambient.keyBuffer = buffer;
  }
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = ambient.keyBuffer; source.playbackRate.value = .9 + Math.random() * .2;
  filter.type = 'bandpass'; filter.frequency.value = 1050 + Math.random() * 250; filter.Q.value = .65;
  gain.gain.value = .09;
  source.connect(filter); filter.connect(gain); gain.connect(master); source.start();
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}
$('soundToggle').addEventListener('click',() => setSound(!soundOn));

function intro() {
  ++sequence;
  setState('intro'); setStep(0); $('deskLetter').disabled = true;
  $('curtains').removeAttribute('aria-hidden');
  $('introCopy').inert = false;
  $('revealButton').disabled = false;
  body.classList.remove('curtains-open');
  announce('Chọn Vén màn để bước vào lớp học.');
}
async function revealCurtains() {
  if (state !== 'intro') return;
  const run = ++sequence;
  setState('revealing');
  $('revealButton').disabled = true;
  $('introCopy').inert = true;
  if (!ambient) void setSound(true);
  body.classList.add('curtains-open');
  if (!reduceMotion && !animationFrame && !document.hidden) {
    lastTime = performance.now(); animationFrame = requestAnimationFrame(draw);
  }
  await delay(2800); if(run!==sequence)return;
  $('curtains').setAttribute('aria-hidden', 'true');
  setState('explore'); setStep(1); $('deskLetter').disabled=false;
  $('deskLetter').focus({preventScroll:true});
  announce('Màn đã mở. Có một phong thư trên bàn giáo viên. Chạm vào thư để khám phá.');
}
$('revealButton').addEventListener('click', revealCurtains);
function floatingRect() {
  const width=Math.min(500,innerWidth*.82,innerHeight*.72), height=width/1.6;
  return {left:(innerWidth-width)/2,top:innerHeight*.47-height/2,width,height};
}
function placeFloating() { Object.assign($('floatingLetter').style,Object.fromEntries(Object.entries(floatingRect()).map(([k,v])=>[k,v+'px']))); }
async function liftLetter() {
  if(state!=='explore')return;
  const run = ++sequence; setState('lifting');
  returnFocus=$('deskLetter');
  // First interaction enables sound; the dedicated toggle can mute it at any time.
  if(!ambient) await setSound(true);
  if(run!==sequence)return;
  paperSound(.5); chime();
  const rect=$('deskLetter').getBoundingClientRect(), target=floatingRect(), floating=$('floatingLetter');
  floating.hidden=false; floating.classList.remove('opening','handoff'); floating.style.opacity='1'; floating.disabled=true;
  placeFloating(); $('deskLetter').style.opacity='0'; $('deskLetter').disabled=true;
  const animation=floating.animate([
    {transform:`translate(${rect.left-target.left}px,${rect.top-target.top}px) scale(${rect.width/target.width},${rect.height/target.height}) rotate(-8deg)`,opacity:.8},
    {transform:'translate(0,-24px) scale(1.03) rotate(2deg)',opacity:1,offset:.78},
    {transform:'translate(0,0) scale(1) rotate(0deg)',opacity:1}
  ],{duration:reduceMotion?1:1450,easing:'cubic-bezier(.22,.68,.15,1)',fill:'none'});
  await animation.finished.catch(()=>{}); if(run!==sequence)return;
  setState('focus'); floating.disabled=false; $('closeFocus').hidden=false; $('focusPrompt').hidden=false;
  floating.focus({preventScroll:true}); announce('Phong thư đã ở trước mặt bạn. Chạm vào dấu sáp để mở thư.');
}
async function openLetter() {
  if(state!=='focus')return;
  const run=++sequence; setState('opening'); $('floatingLetter').disabled=true;
  $('focusPrompt').hidden=true; $('floatingLetter').classList.add('opening');
  paperSound(1.1);
  await delay(1250); if(run!==sequence)return; chime('open');
  prepareLetter();
  $('letterAction').disabled=true;
  const peek = $('floatingLetter').querySelector('.paper-peek').getBoundingClientRect();
  $('letterDialog').hidden=false;
  $('floatingLetter').classList.add('handoff');
  const paper = $('letterDialog').querySelector('.letter-paper');
  const target = paper.getBoundingClientRect();
  const dx = peek.left + peek.width / 2 - target.left - target.width / 2;
  const dy = peek.top + peek.height / 2 - target.top - target.height / 2;
  const scale = Math.min(1, peek.width / target.width);
  const duration = reduceMotion ? 1 : 1100;
  const paperMotion = paper.animate([
    {transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:0},
    {opacity:1,offset:.28},
    {transform:'translate(0,0) scale(1)',opacity:1}
  ],{duration,easing:'cubic-bezier(.22,.61,.36,1)'});
  const envelopeMotion = $('floatingLetter').animate([
    {transform:'translateY(0)',opacity:1},
    {transform:'translateY(65px)',opacity:0}
  ],{duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'});
  await paperMotion.finished.catch(()=>{}); if(run!==sequence)return;
  $('floatingLetter').hidden=true; envelopeMotion.cancel();
  $('letterAction').disabled=false;
  setState('reading'); setStep(2);
  $('letterAction').focus({preventScroll:true}); announce('Lá thư đã mở.'); startTyping();
}
$('deskLetter').addEventListener('click',liftLetter);
$('floatingLetter').addEventListener('click',openLetter);
function finishTyping() {
  cancelAnimationFrame(typingFrame); $('typedText').textContent=LETTER.message;
  $('typedText').classList.remove('typing'); $('signature').classList.add('visible'); typingDone=true;
  $('letterAction').innerHTML='Cất thư, giữ lại ký ức <span>↗</span>';
}
function prepareLetter() {
  cancelAnimationFrame(typingFrame); typingDone=false;
  $('letterTitle').textContent=LETTER.greeting; $('accessibleLetter').textContent=LETTER.message;
  $('letterLayout').textContent=LETTER.message;
  $('signature').querySelector('i').textContent=LETTER.signature;
  $('signature').classList.remove('visible'); $('typedText').textContent=''; $('typedText').classList.add('typing');
  $('letterAction').innerHTML='Đọc trọn lá thư <span>→</span>';
}
function startTyping() {
  prepareLetter();
  if(reduceMotion){finishTyping();return;}
  const chars = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('vi', {granularity:'grapheme'}).segment(LETTER.message), item => item.segment)
    : Array.from(LETTER.message.normalize('NFC'));
  let count = 0, nextCharacterAt = performance.now() + 450;
  function tick(now){
    if (now >= nextCharacterAt && count < chars.length) {
      const character = chars[count++];
      $('typedText').textContent = chars.slice(0,count).join('');
      typingClick(character);
      const pause = /[.!?…]/.test(character) ? 360 : /[,;:—]/.test(character) ? 180 : character === '\n' ? 450 : 0;
      nextCharacterAt = now + 75 + pause;
    }
    if(count<chars.length)typingFrame=requestAnimationFrame(tick);else finishTyping();
  } typingFrame=requestAnimationFrame(tick);
}
$('letterAction').addEventListener('click',()=>typingDone?closeLetter():finishTyping());
function closeLetter() {
  if(!['lifting','focus','opening','reading'].includes(state))return;
  ++sequence; cancelAnimationFrame(typingFrame); paperSound(.4);
  $('floatingLetter').getAnimations().forEach(a=>a.cancel());
  $('letterDialog').querySelector('.letter-paper').getAnimations().forEach(a=>a.cancel());
  $('floatingLetter').hidden=true; $('letterDialog').hidden=true; $('focusPrompt').hidden=true; $('closeFocus').hidden=true;
  $('floatingLetter').classList.remove('opening'); $('deskLetter').style.opacity='1'; $('deskLetter').disabled=false;
  setState('explore'); $('guidanceText').textContent='Một lá thư đã mở. Một miền ký ức còn đây.';
  (returnFocus||$('deskLetter')).focus({preventScroll:true}); announce('Đã trở về lớp học. Bạn có thể mở và đọc lại lá thư.');
}
$('closeFocus').addEventListener('click',closeLetter);
$('focusShade').addEventListener('click',closeLetter);
$('replayButton').addEventListener('click',()=>{
  if(state==='intro'||state==='revealing')return;
  closeLetter(); $('guidanceText').textContent='Có một lá thư trên bàn. Chạm để khám phá.'; intro();
});
const help=$('helpDialog');
$('helpButton').addEventListener('click',()=>help.showModal());
help.querySelector('.help-close').addEventListener('click',()=>help.close());
$('helpDone').addEventListener('click',()=>help.close());
help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)help.close();}});
document.addEventListener('keydown',e=>{
  if(help.open || $('letterEditor').open)return;
  if(e.key==='Escape')closeLetter();
  if(e.key==='Tab'&&['focus','opening','reading'].includes(state)){
    const controls=state==='reading'?[$('closeFocus'),$('letterAction')]:state==='focus'?[$('closeFocus'),$('floatingLetter')]:[$('closeFocus')];
    const i=controls.indexOf(document.activeElement);
    e.preventDefault();controls[(i+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();
  }
});
$('fullscreenToggle').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else announce('Trình duyệt này chưa hỗ trợ toàn màn hình.');}catch{announce('Không thể bật toàn màn hình trong cửa sổ này.');}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreenToggle').setAttribute('aria-label',document.fullscreenElement?'Thoát toàn màn hình':'Toàn màn hình');});

// Small camera motion complements the independent illustration layers.
let targetX=0,targetY=0,cameraX=0,cameraY=0;
document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!reduceMotion){targetX=(e.clientX/innerWidth-.5)*-9;targetY=(e.clientY/innerHeight-.5)*-6;}},{passive:true});
document.addEventListener('pointerleave',()=>{targetX=0;targetY=0;});
const canvas=$('particles'),ctx=canvas.getContext('2d');
let particles=[],lastTime=0,animationFrame=0;
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;ctx?.setTransform(dpr,0,0,dpr,0,0);
  particles=Array.from({length:reduceMotion?14:42},(_,i)=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.2+.5,a:Math.random()*.35+.08,speed:Math.random()*12+5,phase:i*1.37,petal:i<5}));
  if(['focus','opening','lifting'].includes(state))placeFloating();
  if(reduceMotion)draw(performance.now());
}
function draw(time){
  if (state === 'intro' || document.hidden) { animationFrame = 0; return; }
  const dt=Math.min((time-lastTime)/1000,.05)||.016;lastTime=time;
  cameraX+=(targetX-cameraX)*.045;cameraY+=(targetY-cameraY)*.045;
  $('world').style.setProperty('--px',cameraX.toFixed(2)+'px');$('world').style.setProperty('--py',cameraY.toFixed(2)+'px');
  if(ctx){ctx.clearRect(0,0,innerWidth,innerHeight);const wind=.7+Math.sin(time/7000*Math.PI*2)*.3;
    for(const p of particles){
      if(!reduceMotion){p.x+=p.speed*wind*dt;p.y+=(Math.sin(time/2400+p.phase)*4+(p.petal?5:-1))*dt;if(p.x>innerWidth+15){p.x=-15;p.y=Math.random()*innerHeight;}if(p.y>innerHeight+15)p.y=-15;if(p.y<-15)p.y=innerHeight+15;}
      ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=p.a;
      if(p.petal){ctx.rotate(Math.sin(time/3300+p.phase)*.7+.4);ctx.fillStyle='#e0b18a';ctx.beginPath();ctx.ellipse(0,0,p.r*3.2,p.r*1.2,0,0,Math.PI*2);ctx.fill();}
      else{ctx.fillStyle='#fff1c7';ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();}ctx.restore();
    }
  }
  if(!reduceMotion&&!document.hidden)animationFrame=requestAnimationFrame(draw);
}
window.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>{
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  body.classList.toggle('is-hidden', document.hidden);
  if(document.hidden){if(ambient)ambient.ctx.suspend().catch(()=>{});}else{lastTime=performance.now();if(!reduceMotion)animationFrame=requestAnimationFrame(draw);if(soundOn&&ambient)ambient.ctx.resume().catch(()=>{});}
});

// Six consecutive clock clicks within six seconds unlock the editor.
const editor = $('letterEditor');
let clockClicks = [], htmlFileHandle = null, editorBusy = false, preparedTemplate = null;
function resetClockClicks() { clockClicks = []; }
$('clockTrigger').addEventListener('click', () => {
  if (state !== 'explore' || editor.open) return;
  const now = performance.now();
  clockClicks = clockClicks.filter(time => now - time <= 6000);
  clockClicks.push(now);
  if (clockClicks.length < 6) return;
  resetClockClicks();
  $('editGreeting').value = LETTER.greeting;
  $('editMessage').value = LETTER.message;
  $('editSignature').value = LETTER.signature;
  editorMessage(''); editor.showModal(); $('editGreeting').focus();
});
document.addEventListener('click', event => {
  if (!event.target.closest('#clockTrigger')) resetClockClicks();
});
function editorMessage(message, error = false) {
  $('editorStatus').textContent = message;
  $('editorStatus').dataset.error = String(error);
}
function closeEditor() { if (!editorBusy) editor.close(); }
$('editorClose').addEventListener('click', closeEditor);
editor.addEventListener('cancel', event => { if (editorBusy) event.preventDefault(); });
editor.addEventListener('close', () => { resetClockClicks(); $('clockTrigger').focus({preventScroll:true}); });
function readEditorContent() {
  return {
    greeting: $('editGreeting').value.trim().normalize('NFC'),
    message: $('editMessage').value.trim().normalize('NFC'),
    signature: $('editSignature').value.trim().normalize('NFC')
  };
}
function blobDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được tài nguyên để đóng gói HTML.'));
    reader.readAsDataURL(blob);
  });
}
async function fetchLocalAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không tải được tài nguyên của trang.');
  return response;
}
async function getPortableTemplate() {
  if (!preparedTemplate) {
    preparedTemplate = (async () => {
      const copy = HTML_TEMPLATE.cloneNode(true);
      // Font files are embedded below; exported HTML must not request the old URLs.
      copy.querySelectorAll('link[rel="preload"]').forEach(link => link.remove());
      // preview.html already embeds its styles, fonts and script. A server-served
      // dist/index.html is converted into the same portable single-file format.
      for (const link of [...copy.querySelectorAll('link[rel="stylesheet"]')]) {
        const url = new URL(link.getAttribute('href'), document.baseURI);
        let css = await (await fetchLocalAsset(url)).text();
        const references = [...css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)];
        for (const match of references) {
          if (match[1].startsWith('data:') || match[1].startsWith('#')) continue;
          const assetURL = new URL(match[1], url);
          const data = await blobDataURL(await (await fetchLocalAsset(assetURL)).blob());
          css = css.replace(match[0], `url("${data}")`);
        }
        const style = document.createElement('style'); style.textContent = css; link.replaceWith(style);
      }
      for (const external of [...copy.querySelectorAll('script[src]')]) {
        const code = await (await fetchLocalAsset(new URL(external.getAttribute('src'), document.baseURI))).text();
        const inline = document.createElement('script'); inline.textContent = code; external.replaceWith(inline);
      }
      return copy;
    })().catch(error => { preparedTemplate = null; throw error; });
  }
  return preparedTemplate;
}
async function buildLetterHTML(content) {
  const copy = (await getPortableTemplate()).cloneNode(true);
  let config = copy.querySelector('#letterConfig');
  if (!config) { config = document.createElement('script'); config.id = 'letterConfig'; config.type = 'application/json'; copy.querySelector('head').append(config); }
  config.textContent = JSON.stringify(content).replace(/</g, '\\u003c');
  return '<!doctype html>\n' + copy.outerHTML;
}
async function saveEditedLetter(downloadOnly = false) {
  if (editorBusy || !$('editorForm').reportValidity()) return;
  const content = readEditorContent();
  if (Object.values(content).some(value => !value)) { editorMessage('Vui lòng điền đầy đủ lời chào, nội dung và người gửi.', true); return; }
  editorBusy = true;
  for (const id of ['editorSave','editorDownload','editorClose']) $(id).disabled = true;
  editorMessage('Đang chuẩn bị tệp HTML…');
  try {
    const canWrite = !downloadOnly && typeof window.showSaveFilePicker === 'function';
    if (canWrite && !htmlFileHandle) {
      // Invoke the picker before awaiting asset preparation to preserve the click gesture.
      htmlFileHandle = await window.showSaveFilePicker({suggestedName:'preview.html',types:[{description:'Trang web HTML',accept:{'text/html':['.html']}}]});
    }
    const html = await buildLetterHTML(content);
    if (canWrite) {
      const writable = await htmlFileHandle.createWritable();
      try { await writable.write(html); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
      editorMessage(`Đã lưu nội dung vào ${htmlFileHandle.name}. Mở lại tệp này để dùng bản đã cập nhật.`);
    } else {
      const url = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'preview.html';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      editorMessage('Đã tạo bản HTML để tải xuống. Hãy giữ tệp vừa tải hoặc dùng nó thay tệp cũ; tệp đang mở chưa được ghi đè tự động.');
    }
    Object.assign(LETTER, content);
  } catch (error) {
    if (error.name === 'AbortError') editorMessage('Đã hủy lưu. Nội dung bạn nhập vẫn còn trong trình sửa.');
    else {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') htmlFileHandle = null;
      editorMessage('Chưa lưu được tệp. Bạn có thể chọn “Tải bản HTML”. Nếu đang mở dist/index.html trực tiếp, hãy dùng preview.html hoặc chạy qua localhost.', true);
    }
  } finally {
    editorBusy = false;
    for (const id of ['editorSave','editorDownload','editorClose']) $(id).disabled = false;
  }
}
$('editorForm').addEventListener('submit', event => { event.preventDefault(); void saveEditedLetter(); });
$('editorDownload').addEventListener('click', () => { void saveEditedLetter(true); });

async function initializeScene() {
  // The head's tiny curtain cover is painted before the large SVG is parsed.
  // Reveal only once layout and both Vietnamese font faces have settled.
  intro(); resize();
  let timeout;
  const fontReady = document.fonts
    ? Promise.all([
        document.fonts.load('16px "Noto Sans VN"'),
        document.fonts.load('italic 16px "Noto Sans VN"')
      ]).then(results => results.every(fonts => fonts.length > 0)).catch(() => false)
    : Promise.resolve(false);
  const fontsLoaded = await Promise.race([
    fontReady,
    new Promise(resolve => { timeout = setTimeout(() => resolve(false), 3500); })
  ]);
  clearTimeout(timeout);
  if (!fontsLoaded) document.documentElement.classList.add('font-fallback');
  requestAnimationFrame(() => {
    document.documentElement.classList.add('scene-ready');
  });
}
void initializeScene();
