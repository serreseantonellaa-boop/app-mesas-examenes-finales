// ---------- instalar como app ----------
let deferredInstallPrompt = null;

function esStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function esIOS(){
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}
function mostrarBannerInstalacion(){
  if(esStandalone()) return;
  if(localStorage.getItem('install_banner_dismissed')) return;
  const banner = document.getElementById('installBanner');
  if(deferredInstallPrompt){
    banner.innerHTML = `<span>📲 Instalá esta app en tu celular para usarla más rápido</span>
      <button id="installBtn">Instalar</button>
      <button class="dismiss" id="dismissInstallBtn">✕</button>`;
    document.getElementById('installBtn').addEventListener('click', async () => {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      banner.style.display = 'none';
    });
  } else if(esIOS()){
    banner.innerHTML = `<span>📲 Para instalarla: tocá compartir (□↑) y elegí "Agregar a inicio"</span>
      <button class="dismiss" id="dismissInstallBtn">✕</button>`;
  } else {
    return;
  }
  document.getElementById('dismissInstallBtn').addEventListener('click', () => {
    banner.style.display = 'none';
    localStorage.setItem('install_banner_dismissed', '1');
  });
  banner.style.display = 'flex';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  mostrarBannerInstalacion();
});
window.addEventListener('load', () => {
  if(esIOS()) mostrarBannerInstalacion();
});

// ---------- utilidades ----------
function normalizar(s){
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim();
}
function parseDMY(str){
  const [d,m,y] = (str||'').split('/').map(Number);
  return new Date(y||0, (m||1)-1, d||0);
}
function parseHora(str){
  const [h,m] = (str||'0:0').split(':').map(Number);
  return (h||0)*60 + (m||0);
}

// ---------- estado en memoria ----------
let currentUser = null;    // objeto de Firebase Auth
let nombreBusqueda = '';   // nombre usado para filtrar mesas
let misMesas = [];
let estado = {};           // { mesaId: {acta, campus} }
let alumnosPorMesa = {};   // { mesaId: [{nombre,apellido,nota}] }
let alumnosAbiertos = {};  // { mesaId: bool } — qué paneles de alumnos están desplegados
let guardando = false;
let googleAccessToken = null; // token de Google para llamar a la API de Calendar

function coincideNombre(campo, palabras){
  const c = normalizar(campo);
  return palabras.length > 0 && palabras.every(p => c.includes(p));
}

// ---------- construir "mis mesas" desde los datos embebidos ----------
function construirMisMesas(nombre){
  const palabras = normalizar(nombre).split(/\s+/).filter(Boolean);
  const filtradas = ALL_MESAS.filter(r =>
    coincideNombre(r.titular, palabras) || coincideNombre(r.cotitular, palabras)
  );

  const grupos = {};
  filtradas.forEach(r => {
    const gkey = r.carrera + '|' + r.codigo;
    (grupos[gkey] = grupos[gkey] || []).push(r);
  });
  Object.values(grupos).forEach(rows => {
    rows.sort((a,b) => parseDMY(a.fecha) - parseDMY(b.fecha));
    rows.forEach((r,i) => r.__llamado = i+1);
  });

  const mesas = filtradas.map(r => {
    const rol = coincideNombre(r.titular, palabras) ? 'Titular' : 'Co-Titular';
    const otro = rol === 'Titular' ? r.cotitular : r.titular;
    return {
      id: r.carrera + '-' + r.codigo + '-' + r.fecha,
      carrera: r.carrera, materia: r.materia, codigo: r.codigo,
      fecha: r.fecha, dia: r.dia, horaInicio: r.horaInicio, horaFin: r.horaFin,
      llamado: r.__llamado, rol, otro
    };
  });

  mesas.sort((a,b) => {
    const da = parseDMY(a.fecha) - parseDMY(b.fecha);
    if(da !== 0) return da;
    return parseHora(a.horaInicio) - parseHora(b.horaInicio);
  });
  return mesas;
}

// ---------- Firestore ----------
function docRef(){
  return db.collection('profesores').doc(currentUser.uid);
}

async function cargarDesdeFirestore(){
  const snap = await docRef().get();
  if(snap.exists){
    const data = snap.data();
    nombreBusqueda = data.nombreBusqueda || '';
    estado = data.estado || {};
    alumnosPorMesa = data.alumnos || {};
  } else {
    nombreBusqueda = ''; estado = {}; alumnosPorMesa = {};
  }
}

async function guardarEnFirestore(){
  guardando = true;
  actualizarEstadoSync();
  try{
    await docRef().set({
      nombreBusqueda, estado, alumnos: alumnosPorMesa,
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }catch(e){
    console.error('No se pudo guardar en Firestore', e);
  }
  guardando = false;
  actualizarEstadoSync();
}

function actualizarEstadoSync(){
  const el = document.getElementById('syncStatus');
  if(!el) return;
  el.textContent = guardando ? 'Guardando…' : 'Guardado en la nube ✓';
}

// ---------- pantallas ----------
function mostrarPantallaLogin(){
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('confirmBox').style.display = 'none';
  document.getElementById('app').style.display = 'none';
}
function mostrarPantallaConfirmar(nombreSugerido){
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('confirmBox').style.display = 'block';
  document.getElementById('app').style.display = 'none';
  document.getElementById('nombreInput').value = nombreSugerido || '';
}
function mostrarApp(){
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('confirmBox').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('whoName').textContent = nombreBusqueda;
  document.getElementById('whoEmail').textContent = currentUser.email || '';
}

async function onLoginClick(){
  const provider = new firebase.auth.GoogleAuthProvider();
  try{
    await auth.signInWithPopup(provider);
  }catch(e){
    alert('No se pudo iniciar sesión: ' + e.message);
  }
}
async function onLogoutClick(){
  await auth.signOut();
}

async function onConfirmarNombre(){
  const val = document.getElementById('nombreInput').value.trim();
  if(!val) return;
  nombreBusqueda = val;
  misMesas = construirMisMesas(val);
  await guardarEnFirestore();
  mostrarApp();
  render();
}

function onCambiarNombre(){
  mostrarPantallaConfirmar(nombreBusqueda);
}

// ---------- render ----------
function render(){
  const listEl = document.getElementById('list');
  listEl.innerHTML = '';

  if(misMesas.length === 0){
    listEl.innerHTML = `<div class="empty">No encontré mesas donde figure "<b>${nombreBusqueda}</b>" como Titular o Co-Titular en ninguna de las dos carreras. Probá con el apellido solo.</div>`;
    return;
  }

  let lastDay = null;
  misMesas.forEach(m => {
    const dayKey = m.dia + m.fecha;
    if(dayKey !== lastDay){
      lastDay = dayKey;
      const h = document.createElement('div');
      h.className = 'day-heading';
      h.textContent = m.dia + ' ' + m.fecha.slice(0,5);
      listEl.appendChild(h);
    }
    const s = estado[m.id] || {acta:false, campus:false};
    const misAlumnos = alumnosPorMesa[m.id] || [];
    const abierto = !!alumnosAbiertos[m.id];
    const isVJ = m.carrera === 'Videojuegos';

    const card = document.createElement('div');
    card.className = 'card' + (isVJ ? ' vj' : '');
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="materia">${m.materia}</div>
          <div class="meta">${m.horaInicio}–${m.horaFin} · ${m.llamado}° llamado · ${m.rol} · Cód. ${m.codigo}</div>
        </div>
        <span class="badge ${isVJ ? 'vj' : 'mm'}">${m.carrera}</span>
      </div>
      <div class="toggles">
        <div class="tgl ${s.acta ? 'active-acta' : ''}" data-id="${m.id}" data-field="acta">
          <span>${s.acta ? '✅' : '✍️'}</span><span>Acta firmada</span>
        </div>
        <div class="tgl ${s.campus ? 'active-campus' : ''}" data-id="${m.id}" data-field="campus">
          <span>${s.campus ? '✅' : '💻'}</span><span>Campus cargado</span>
        </div>
      </div>
      ${s.calendarSynced ? '<div class="cal-ok">📅 En tu Google Calendar</div>' : ''}
      <div class="alumnos-toggle" data-id="${m.id}">
        <span>${abierto ? '▲' : '▼'}</span> 👥 ${abierto ? 'Ocultar' : 'Ver'} alumnos (${misAlumnos.length})
      </div>
      <div class="alumnos-box ${abierto ? 'open' : ''}" id="box-${m.id}">
        ${misAlumnos.map((a,i) => `
          <div class="alumno-row">
            <span class="an">${a.apellido}, ${a.nombre}</span>
            <span class="nota">${a.nota || '—'}</span>
            <button data-del="${m.id}:${i}">🗑️</button>
          </div>
        `).join('')}
        <div class="add-alumno">
          <input class="ape" placeholder="Apellido" data-new-ape="${m.id}">
          <input class="nom" placeholder="Nombre" data-new-nom="${m.id}">
          <input class="nt" placeholder="Nota" data-new-nota="${m.id}">
          <button data-add="${m.id}">+</button>
        </div>
        <div class="cerrar-alumnos" data-id="${m.id}">▲ Cerrar</div>
      </div>
    `;
    listEl.appendChild(card);
  });

  document.querySelectorAll('.tgl').forEach(el => el.addEventListener('click', onToggle));
  document.querySelectorAll('.alumnos-toggle, .cerrar-alumnos').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.id;
    alumnosAbiertos[id] = !alumnosAbiertos[id];
    render();
  }));
  document.querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', onAddAlumno));
  document.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', onDelAlumno));
}

async function onToggle(e){
  const { id, field } = e.currentTarget.dataset;
  if(!estado[id]) estado[id] = {acta:false, campus:false};
  estado[id][field] = !estado[id][field];
  render();
  await guardarEnFirestore();
}

async function onAddAlumno(e){
  const mesaId = e.currentTarget.dataset.add;
  const nombre = document.querySelector(`[data-new-nom="${mesaId}"]`).value.trim();
  const apellido = document.querySelector(`[data-new-ape="${mesaId}"]`).value.trim();
  const nota = document.querySelector(`[data-new-nota="${mesaId}"]`).value.trim();
  if(!nombre && !apellido) return;
  (alumnosPorMesa[mesaId] = alumnosPorMesa[mesaId] || []).push({nombre, apellido, nota});
  alumnosAbiertos[mesaId] = true;
  render();
  await guardarEnFirestore();
}

async function onDelAlumno(e){
  const [mesaId, idx] = e.currentTarget.dataset.del.split(':');
  alumnosPorMesa[mesaId].splice(Number(idx), 1);
  alumnosAbiertos[mesaId] = true;
  render();
  await guardarEnFirestore();
}

// ---------- sincronizar con Google Calendar ----------
async function asegurarTokenCalendar(){
  if(googleAccessToken) return googleAccessToken;
  // el token de Google no sobrevive un refresco de página; volvemos a pedirlo
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  const result = await auth.signInWithPopup(provider);
  const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
  googleAccessToken = credential && credential.accessToken;
  return googleAccessToken;
}

async function crearEventoCalendar(m, token){
  const [dd, mm, yyyy] = m.fecha.split('/');
  const [hi_h, hi_m] = m.horaInicio.split(':').map(Number);
  const [hf_h, hf_m] = m.horaFin.split(':').map(Number);
  const pad = n => String(n).padStart(2,'0');
  const startStr = `${yyyy}-${mm}-${dd}T${pad(hi_h)}:${pad(hi_m)}:00`;
  const endStr = `${yyyy}-${mm}-${dd}T${pad(hf_h)}:${pad(hf_m)}:00`;

  const body = {
    summary: `Mesa: ${m.materia} (${m.carrera}) — ${m.llamado}° llamado`,
    description: `Rol: ${m.rol}. Otro docente: ${m.otro || '-'}. Código: ${m.codigo}.`,
    start: { dateTime: startStr, timeZone: 'America/Argentina/Buenos_Aires' },
    end: { dateTime: endStr, timeZone: 'America/Argentina/Buenos_Aires' },
    reminders: {
      useDefault: false,
      overrides: [{ method:'popup', minutes: 60 }, { method:'popup', minutes: 1440 }]
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error && err.error.message ? err.error.message : ('HTTP ' + res.status));
  }
  return res.json();
}

async function onSincronizarCalendar(){
  const btn = document.getElementById('calendarBtn');
  const original = btn.textContent;
  btn.disabled = true;
  try{
    const token = await asegurarTokenCalendar();
    if(!token){ alert('No se pudo obtener permiso de Calendar.'); return; }

    const pendientes = misMesas.filter(m => !(estado[m.id] && estado[m.id].calendarSynced));
    if(pendientes.length === 0){
      alert('Ya están todas tus mesas agregadas al Calendar.');
      return;
    }
    let ok = 0, fail = 0;
    for(const m of pendientes){
      btn.textContent = `Agregando (${ok+fail+1}/${pendientes.length})…`;
      try{
        await crearEventoCalendar(m, token);
        if(!estado[m.id]) estado[m.id] = {acta:false, campus:false};
        estado[m.id].calendarSynced = true;
        ok++;
      }catch(e){
        console.error('Error creando evento', m.id, e);
        fail++;
      }
    }
    await guardarEnFirestore();
    render();
    alert(`Listo: ${ok} mesas agregadas a tu Calendar.` + (fail ? ` (${fail} fallaron, reintentá.)` : ''));
  }catch(e){
    alert('No se pudo sincronizar con Calendar: ' + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- exportar a Excel ----------
function descargarExcel(){
  const mesasRows = misMesas.map(m => {
    const s = estado[m.id] || {acta:false, campus:false};
    return {
      Carrera: m.carrera, Código: m.codigo, Materia: m.materia,
      Fecha: m.fecha, Día: m.dia, 'Hora Inicio': m.horaInicio, 'Hora Fin': m.horaFin,
      Llamado: m.llamado + '° llamado', 'Mi rol': m.rol, 'Otro docente': m.otro,
      'Acta firmada': s.acta ? 'SI' : 'NO', 'Campus cargado': s.campus ? 'SI' : 'NO'
    };
  });
  const alumnosRows = [];
  misMesas.forEach(m => {
    (alumnosPorMesa[m.id] || []).forEach(a => {
      alumnosRows.push({ Materia: m.materia, Fecha: m.fecha, Apellido: a.apellido, Nombre: a.nombre, Nota: a.nota });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mesasRows), 'Mesas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alumnosRows), 'Alumnos');
  const fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Mis_Mesas_${nombreBusqueda.replace(/[^a-zA-Z0-9]+/g,'_')}_${fecha}.xlsx`);
}

// ---------- arranque ----------
document.getElementById('loginBtn').addEventListener('click', onLoginClick);
document.getElementById('logoutBtn').addEventListener('click', onLogoutClick);
document.getElementById('confirmarBtn').addEventListener('click', onConfirmarNombre);
document.getElementById('nombreInput').addEventListener('keydown', e => { if(e.key === 'Enter') onConfirmarNombre(); });
document.getElementById('changeBtn').addEventListener('click', onCambiarNombre);
document.getElementById('downloadBtn').addEventListener('click', descargarExcel);
document.getElementById('calendarBtn').addEventListener('click', onSincronizarCalendar);

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

if(!FIREBASE_CONFIGURADO){
  document.getElementById('loginBox').innerHTML = `
    <h2>Falta configurar Firebase</h2>
    <p>Editá <code>assets/js/firebase-config.js</code> con los datos de tu
    proyecto de Firebase (mirá el README) y volvé a abrir esta página.</p>
  `;
  mostrarPantallaLogin();
} else {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if(user){
      await cargarDesdeFirestore();
      if(nombreBusqueda){
        misMesas = construirMisMesas(nombreBusqueda);
        mostrarApp();
        render();
      } else {
        mostrarPantallaConfirmar(user.displayName || '');
      }
    } else {
      mostrarPantallaLogin();
    }
  });
}
