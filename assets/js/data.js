/* ==========================================================================
   PAVÉLAND · Capa de datos
   Todo lo que habla con Supabase vive aquí. index.html y admin.html sólo
   llaman a estas funciones.
   ========================================================================== */

(function () {
  'use strict';

  var CFG = window.PAVELAND_CONFIG || {};
  var LISTO =
    typeof CFG.SUPABASE_URL === 'string' &&
    CFG.SUPABASE_URL.indexOf('http') === 0 &&
    typeof CFG.SUPABASE_ANON_KEY === 'string' &&
    CFG.SUPABASE_ANON_KEY.length > 20;

  var db = null;
  if (LISTO && window.supabase && window.supabase.createClient) {
    db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  /* ------------------------------------------------------------------------
     Identificador anónimo del dispositivo.
     Es un número aleatorio guardado en el navegador. No identifica a ninguna
     persona; sólo sirve para que el panel pueda detectar patrones raros.
     ------------------------------------------------------------------------ */
  function deviceToken() {
    try {
      var t = localStorage.getItem('pv_device');
      if (!t) {
        t = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('pv_device', t);
      }
      return t;
    } catch (e) {
      return null;
    }
  }

  /* Identificador único de CADA toque. Viaja con el voto y con todos sus
     reintentos, para que el servidor pueda reconocer un duplicado. */
  function nuevoVoteId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Respaldo para navegadores viejos.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ------------------------------------------------------------------------
     BUZÓN DE SALIDA (outbox)
     Si el wifi del local falla justo cuando alguien vota, el voto NO se pierde:
     se guarda en el dispositivo y se reintenta solo, cada 15 s y al abrir la
     página, hasta que el servidor lo confirme.
     Como cada entrada lleva su vote_id, reintentar es seguro: si el envío
     original sí había llegado, el servidor lo ignora en vez de contarlo dos
     veces.
     ------------------------------------------------------------------------ */
  var OUTBOX = 'pv_outbox';

  function leerOutbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); }
    catch (e) { return []; }
  }
  function escribirOutbox(lista) {
    try { localStorage.setItem(OUTBOX, JSON.stringify(lista.slice(-500))); }
    catch (e) {}
  }
  function encolar(dessertId, voteId) {
    var l = leerOutbox();
    if (l.some(function (x) { return x.v === voteId; })) return;   // ya estaba en cola
    l.push({ id: dessertId, v: voteId, t: Date.now() });
    escribirOutbox(l);
  }

  var vaciando = false;
  function vaciarOutbox() {
    if (vaciando || !db) return Promise.resolve(0);
    var pendientes = leerOutbox();
    if (!pendientes.length) return Promise.resolve(0);

    vaciando = true;
    var restantes = [];
    var enviados = 0;

    var cadena = pendientes.reduce(function (prev, item) {
      return prev.then(function () {
        return db.rpc('cast_vote', {
          p_dessert_id: item.id,
          p_vote_id: item.v || nuevoVoteId(),
          p_device_token: deviceToken(),
        })
          .then(function (r) {
            // Si el postre ya no existe (campaña nueva), el voto se descarta.
            if (r.error && r.error.code !== 'P0002' && !/not found|no encontrado/i.test(r.error.message || '')) {
              restantes.push(item);
            } else if (!r.error) {
              enviados++;
            }
          })
          .catch(function () { restantes.push(item); });
      });
    }, Promise.resolve());

    return cadena.then(function () {
      escribirOutbox(restantes);
      vaciando = false;
      return enviados;
    }).catch(function () {
      vaciando = false;
      return 0;
    });
  }

  /* ------------------------------------------------------------------------
     Imágenes de reserva: SVG elegantes con los colores de la marca, para que
     la pantalla se vea terminada antes de subir las fotos reales.
     ------------------------------------------------------------------------ */
  var PLACEHOLDERS = [
    { a: '#FAE6C5', b: '#E8AD72', c: '#9C532C' },
    { a: '#FDEDC2', b: '#FCD389', c: '#914315' },
    { a: '#F6DDBC', b: '#E8AD72', c: '#744423' },
  ];

  function placeholder(pos) {
    var p = PLACEHOLDERS[(pos - 1) % 3];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">' +
        '<defs>' +
          '<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
            '<stop offset="0" stop-color="' + p.a + '"/>' +
            '<stop offset="1" stop-color="' + p.b + '"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="800" height="800" fill="url(#g)"/>' +
        '<g fill="none" stroke="' + p.c + '" stroke-opacity="0.16" stroke-width="2">' +
          '<circle cx="400" cy="400" r="150"/><circle cx="400" cy="400" r="210"/>' +
          '<circle cx="400" cy="400" r="270"/><circle cx="400" cy="400" r="330"/>' +
        '</g>' +
        '<g transform="translate(400 392)" fill="' + p.c + '" fill-opacity="0.5">' +
          '<path d="M-104 -66 h208 a16 16 0 0 1 16 16 v10 a16 16 0 0 1-16 16 h-6 l-14 132 a34 34 0 0 1-34 30 h-110 a34 34 0 0 1-34-30 l-14-132 h-6 a16 16 0 0 1-16-16 v-10 a16 16 0 0 1 16-16z"/>' +
          '<path d="M-64 -80 a64 44 0 0 1 128 0z" fill-opacity="0.75"/>' +
          '<rect x="96" y="-150" width="17" height="118" rx="8" transform="rotate(14 104 -90)"/>' +
        '</g>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ------------------------------------------------------------------------
     Lectura
     ------------------------------------------------------------------------ */

  function cargarCampana() {
    if (!db) return Promise.reject(new Error('SIN_CONFIG'));

    return db.from('campaigns')
      .select('id,title,is_active,created_at')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) throw new Error('SIN_CAMPANA');
        var campana = res.data;

        return db.from('desserts')
          .select('id,position,name,image_url,votes')
          .eq('campaign_id', campana.id)
          .order('position', { ascending: true })
          .then(function (r2) {
            if (r2.error) throw r2.error;
            var postres = (r2.data || []).map(function (d) {
              return {
                id: d.id,
                position: d.position,
                name: d.name || ('Postre #' + d.position),
                image_url: d.image_url || '',
                src: d.image_url || placeholder(d.position),
                esPlaceholder: !d.image_url,
                votes: d.votes || 0,
              };
            });
            return { campana: campana, postres: postres };
          });
      });
  }

  /* ------------------------------------------------------------------------
     Escritura del voto (atómica en el servidor).
     Devuelve siempre una promesa que se resuelve: si la red falla, el voto
     queda encolado y se marca como "diferido".
     ------------------------------------------------------------------------ */

  function votar(dessertId) {
    if (!db) return Promise.resolve({ ok: false, diferido: false, motivo: 'SIN_CONFIG' });

    var voteId = nuevoVoteId();

    var tiempoLimite = new Promise(function (resolve) {
      setTimeout(function () { resolve({ __timeout: true }); }, 6000);
    });

    var envio = db.rpc('cast_vote', {
      p_dessert_id: dessertId,
      p_vote_id: voteId,
      p_device_token: deviceToken(),
    });

    return Promise.race([envio, tiempoLimite])
      .then(function (r) {
        if (r && r.__timeout) {
          // Tarda demasiado. Lo encolamos, pero seguimos escuchando el envío
          // original: si al final llega bien, lo sacamos de la cola. Y aunque
          // se nos escape, el vote_id impide que se cuente dos veces.
          encolar(dessertId, voteId);
          envio.then(function (r2) {
            if (r2 && !r2.error) {
              escribirOutbox(leerOutbox().filter(function (x) { return x.v !== voteId; }));
            }
          }).catch(function () {});
          return { ok: true, diferido: true };
        }
        if (r && r.error) {
          // Error real del servidor (p. ej. campaña cerrada): no reintentar.
          if (r.error.code === 'P0002') return { ok: false, diferido: false, motivo: r.error.message };
          encolar(dessertId, voteId);
          return { ok: true, diferido: true };
        }
        return { ok: true, diferido: false, votes: r && r.data && r.data[0] && r.data[0].votes };
      })
      .catch(function () {
        encolar(dessertId, voteId);
        return { ok: true, diferido: true };
      });
  }

  /* ------------------------------------------------------------------------
     Realtime + respaldo por sondeo
     ------------------------------------------------------------------------ */

  function suscribirse(campaignId, alCambiar) {
    if (!db) return function () {};

    var canal = db.channel('votos_' + campaignId)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'desserts', filter: 'campaign_id=eq.' + campaignId },
          alCambiar)
      .subscribe();

    // Red de seguridad: si el websocket se cae, seguimos refrescando cada 8 s.
    var timer = setInterval(alCambiar, 8000);

    return function () {
      clearInterval(timer);
      try { db.removeChannel(canal); } catch (e) {}
    };
  }

  /* ------------------------------------------------------------------------
     API pública
     ------------------------------------------------------------------------ */

  window.PV = {
    db: db,
    listo: LISTO && !!db,
    cargarCampana: cargarCampana,
    votar: votar,
    suscribirse: suscribirse,
    placeholder: placeholder,
    vaciarOutbox: vaciarOutbox,
    pendientes: function () { return leerOutbox().length; },
    deviceToken: deviceToken,
  };

  // Reintenta los votos pendientes al cargar, al recuperar red y cada 15 s.
  if (db) {
    vaciarOutbox();
    setInterval(vaciarOutbox, 15000);
    window.addEventListener('online', vaciarOutbox);
  }
})();
