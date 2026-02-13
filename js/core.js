/* core.js - Funnel Workspace (TOFU/MOFU/BOFU)
   - Acordeón por sección (1/2/3…)
   - Adjuntos por línea (Agregar / Archivos)
   - Progreso por sección (x/y) y por bloque (x/y)
   - Tabs activos
*/
// core.js (arriba de todo)
window.__sb = window.__sb || window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
    {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
const sb = window.__sb; // usá sb en vez de supabase

if (!sb || !sb.auth) {
  console.error("Supabase client not ready", { sb, url: window.SUPABASE_URL });
}

async function renderAuthBar() {
  const authEl = document.getElementById("auth");
  if (!authEl) return;


    if (!sb || !sb.auth) {
    authEl.innerHTML = `<span style="color:#b00">Auth no disponible (cliente Supabase no inicializado)</span>`;
    return;
  }

  const { data } = await sb.auth.getSession();
  const session = data.session;

  authEl.innerHTML = "";

  window.FUNNELS = window.FUNNELS || {};

  // --------- NO LOGUEADO: MAGIC LINK ----------
  if (!session) {
    const email = document.createElement("input");
    email.placeholder = "Email";
    email.type = "email";
    email.autocomplete = "email";

    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = "Enviar link de acceso";

    const msg = document.createElement("div");
    msg.className = "auth-msg";
    msg.textContent = "";

    btn.onclick = async () => {
      const to = email.value.trim();
      if (!to) {
        msg.textContent = "Ingresá tu email.";
        return;
      }

      msg.textContent = "Enviando link...";
      const { error } = await sb.auth.signInWithOtp({
        email: to,
        options: {
          emailRedirectTo: window.location.href
        }
      });

      if (error) {
        msg.textContent = error.message;
        return;
      }

      msg.textContent = "Listo. Revisá tu correo y abrí el link para ingresar.";
    };

    authEl.appendChild(email);
    authEl.appendChild(btn);
    authEl.appendChild(msg);
    return;
  }

  // --------- LOGUEADO ----------
  const who = document.createElement("div");
  who.className = "auth-who";
  who.textContent = session.user.email;

  const out = document.createElement("button");
  out.className = "btn";
  out.textContent = "Salir";
  out.onclick = async () => {
    await sb.auth.signOut();
    STORE_CACHE = {};
    STORE_LOADED = false;
    document.getElementById("content").innerHTML = "";
    await renderAuthBar();
  };

  authEl.appendChild(who);
  authEl.appendChild(out);
}

    



// =====================
// Storage (Supabase Postgres - links compartidos)
// =====================

// Cache en memoria: section_key -> [ {id,label,href} ]
let STORE_CACHE = {};
let STORE_LOADED = false;
const STAGE_LOADED = {};

// Carga inicial (se mantiene por compatibilidad con index.html)
async function ensureStoreLoaded() {
  if (STORE_LOADED) return;
  STORE_CACHE = {};
  STORE_LOADED = true;
}

// Precarga por etapa (TOFU/MOFU/BOFU) para que los badges de progreso sean correctos
async function ensureStageLoaded(stage) {
  if (STAGE_LOADED[stage]) return;

  const { data, error } = await sb
    .from("section_links")
    .select("id, stage, section_key, url, title")
    .eq("stage", stage);

  if (error) {
    console.error("Supabase load error:", error);
    STAGE_LOADED[stage] = true;
    return;
  }

  // Vaciar solo las keys de esta etapa
  Object.keys(STORE_CACHE).forEach(k => {
    if (k.startsWith(stage + "||")) delete STORE_CACHE[k];
  });

  (data || []).forEach(row => {
    const key = row.section_key;
    if (!STORE_CACHE[key]) STORE_CACHE[key] = [];
    STORE_CACHE[key].push({
      id: row.id,
      label: row.title || row.url,
      href: row.url
    });
  });

  STAGE_LOADED[stage] = true;
}

function getAttachments(key) {
  const arr = STORE_CACHE[key];
  return Array.isArray(arr) ? arr : [];
}

async function addAttachment(stage, key, att) {
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id || null;

  const payload = {
    stage,
    section_key: key,
    url: att.href,
    title: att.label || null,
    created_by: userId
  };

  const { data, error } = await sb
    .from("section_links")
    .insert([payload])
    .select("id, url, title")
    .single();

  if (error) throw error;

  // Actualizar cache local
  const arr = getAttachments(key).slice();
  arr.push({ id: data.id, label: data.title || data.url, href: data.url });
  STORE_CACHE[key] = arr;
}

async function updateAttachment(key, att) {
  const payload = {
    url: att.href,
    title: att.label || null
  };

  const { error } = await sb
    .from("section_links")
    .update(payload)
    .eq("id", att.id);

  if (error) throw error;

  // Actualizar cache local
  const arr = getAttachments(key).map(x => (x.id === att.id ? att : x));
  STORE_CACHE[key] = arr;
}

async function deleteAttachment(key, attId) {
  const { error } = await sb
    .from("section_links")
    .delete()
    .eq("id", attId);

  if (error) throw error;

  // Actualizar cache local
  const arr = getAttachments(key).filter(x => x.id !== attId);
  STORE_CACHE[key] = arr;
}

function getItemKey(funnelName, blockTitle, sectionTitle, lineText) {
  return `${funnelName}||${blockTitle}||${sectionTitle}||${lineText}`;
}


// ==========
// UI helpers
// ==========
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeBtn(label, onClick, className = "btn") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function promptAddAttachment() {
  const label = prompt("Nombre/etiqueta del archivo (ej: Brief Buyer Persona)");
  if (!label) return null;

  const href = prompt("Pegá el link/URL (Drive, PDF, Notion, etc.)");
  if (!href) return null;

  return { label, href };
}

function promptEditAttachment(att) {
  const label = prompt("Editar nombre/etiqueta:", att.label);
  if (!label) return null;

  const href = prompt("Editar link/URL:", att.href);
  if (!href) return null;

  return { ...att, label, href };
}

// ==================
// Progress calculators
// ==================
function computeSectionProgress(funnelName, blockTitle, section) {
  const total = Array.isArray(section.items) ? section.items.length : 0;
  let done = 0;

  (section.items || []).forEach(itemText => {
    const key = getItemKey(funnelName, blockTitle, section.title, itemText);
    if (getAttachments(key).length > 0) done++;
  });

  let status = "empty";
  if (done === 0) status = "empty";
  else if (done < total) status = "progress";
  else status = "done";

  const ratio = total === 0 ? 0 : done / total;
  return { done, total, status, ratio };
}

function computeBlockProgress(funnelName, block) {
  let total = 0;
  let done = 0;

  (block.sections || []).forEach(section => {
    (section.items || []).forEach(itemText => {
      total++;
      const key = getItemKey(funnelName, block.title, section.title, itemText);
      if (getAttachments(key).length > 0) done++;
    });
  });

  let status = "empty";
  if (done === 0) status = "empty";
  else if (done < total) status = "progress";
  else status = "done";

  return { done, total, status };
}

// ============
// Main render
// ============
async function loadFunnel(name) {

    await ensureStageLoaded(name);

  // Tabs activos
 const norm = (s) =>
  (s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes

document.querySelectorAll(".funnel-tab").forEach(btn => {
  btn.classList.toggle("active", norm(btn.textContent) === norm(name))
  });

  const funnel = FUNNELS[name];
  if (!funnel) {
    const container = document.getElementById("content");
    if (container) container.innerHTML = "";
  await ensureStageLoaded(name);
    return;
  }

  const container = document.getElementById("content");
  if (!container) return;

  container.innerHTML = "";
  container.appendChild(el("h1", null, name));

  (funnel.blocks || []).forEach(block => {
    const blockEl = el("section", "block");

    // Block title + progress
    const blockProg = computeBlockProgress(name, block);

    const h2 = el("h2", "block-title");
    h2.textContent = block.title;

    const blockBadge = el(
      "span",
      `block-progress status-${blockProg.status}`,
      `${blockProg.done}/${blockProg.total}`
    );
    h2.appendChild(blockBadge);
    blockEl.appendChild(h2);

    // Sections
    (block.sections || []).forEach(section => {
      const sectionWrap = el("div", "section");
      sectionWrap.classList.add("collapsed"); // arranca plegado

      const prog = computeSectionProgress(name, block.title, section);

      // Header 1/2/3… (con adjuntos + progreso)
      const sectionLine = renderLineWithAttachments(
        name,
        block.title,
        section.title,
        section.title,
        { isHeaderLine: true, progress: prog }
      );
      sectionLine.classList.add("accordion-header");
  if (section.formUrl) {
    const right = sectionLine.querySelector(".line-actions");
    if (right) {
      const btnForm = makeBtn("Abrir formulario", () => {
        window.open(section.formUrl, "_blank", "noopener,noreferrer");
      }, "btn btn-primary");

      right.insertBefore(btnForm, right.firstChild);
    }
  }


       

      // Body (plegable)
      const accordionBody = el("div", "accordion-body");

      const ul = el("ul", "items");
      (section.items || []).forEach(itemText => {
        const li = el("li", "item");
        li.appendChild(
          renderLineWithAttachments(name, block.title, section.title, itemText)
        );
        ul.appendChild(li);
      });
       // Botón formulario en el header (si existe formUrl)
if (section.formUrl) {
  const right = sectionLine.querySelector(".line-actions");
  const btnForm = makeBtn("Abrir formulario", () => {
    window.open(section.formUrl, "_blank", "noopener,noreferrer");
  }, "btn btn-primary");

  // lo ponemos primero para que se vea antes que "Agregar archivo"
  right.insertBefore(btnForm, right.firstChild);
}


      accordionBody.appendChild(ul);

      sectionWrap.appendChild(sectionLine);
      sectionWrap.appendChild(accordionBody);

      // Toggle acordeón (clic fuera de botones)
      sectionLine.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        sectionWrap.classList.toggle("collapsed");
      });

      blockEl.appendChild(sectionWrap);
    });

    container.appendChild(blockEl);
  });
}

// ====================================
// Line with attachments (buttons/panel)
// ====================================
function renderLineWithAttachments(funnelName, blockTitle, sectionTitle, lineText, opts = {}) {
  const row = el("div", opts.isHeaderLine ? "line-row line-row-header" : "line-row");
  row.dataset.funnelName = funnelName;


  const left = el("div", "line-text", lineText);
  row.appendChild(left);

  const right = el("div", "line-actions");

  // Progress badge (solo headers 1/2/3…)
  if (opts.isHeaderLine && opts.progress) {
    const p = opts.progress;
    const progressBadge = el(
      "span",
      `progress-badge status-${p.status}`,
      `${p.done}/${p.total}`
    );
    right.appendChild(progressBadge);
  }

  const key = getItemKey(funnelName, blockTitle, sectionTitle, lineText);

const btnAdd = makeBtn("Agregar archivo", async () => {
  const att = promptAddAttachment();
  if (!att) return;

  try {
    await addAttachment(funnelName, key, att);

    refreshAttachmentsPanel(row, key);
    refreshLineAttachmentsCount(row, key);

    // refrescar badges de progreso re-renderizando el funnel actual
    loadFunnel(funnelName);
  } catch (e) {
    alert(e?.message || String(e));
  }
}, "btn btn-primary");


  const btnFiles = makeBtn(getFilesLabel(key), () => {
    toggleAttachmentsPanel(row, key);
    refreshLineAttachmentsCount(row, key);
  }, "btn btn-files");

  right.appendChild(btnAdd);
  right.appendChild(btnFiles);
  row.appendChild(right);

  const panel = el("div", "attachments-panel");
  panel.style.display = "none";
  panel.dataset.attachKey = key;
  row.appendChild(panel);

  return row;
}

function getFilesLabel(key) {
  const count = getAttachments(key).length;
  return count > 0 ? `Archivos (${count})` : "Archivos";
}

function refreshLineAttachmentsCount(row, key) {
  const btn = row.querySelector("button.btn-files");
  if (!btn) return;
  btn.textContent = getFilesLabel(key);
}

function toggleAttachmentsPanel(row, key) {
  const panel = row.querySelector(".attachments-panel");
  if (!panel) return;

  const isOpen = panel.style.display !== "none";
  if (isOpen) {
    panel.style.display = "none";
    return;
  }

  refreshAttachmentsPanel(row, key);
  panel.style.display = "block";
}

function refreshAttachmentsPanel(row, key) {
  const panel = row.querySelector(".attachments-panel");
  if (!panel) return;

  panel.innerHTML = "";

  const arr = getAttachments(key);

  if (arr.length === 0) {
    panel.appendChild(el("div", "attachments-empty", "Sin archivos adjuntos."));
    return;
  }

  const list = el("div", "attachments-list");

  arr.forEach(att => {
    const item = el("div", "attachment-item");

   const link = document.createElement("a");
link.href = att.href;
link.textContent = att.label;
link.target = "_blank";
link.rel = "noopener noreferrer";
link.className = "attachment-link";

const actions = el("div", "attachment-actions");

// Botón Abrir (acción principal)
const btnOpen = makeBtn("Abrir", () => {
  window.open(att.href, "_blank", "noopener,noreferrer");
}, "btn btn-small btn-open");

    const btnEdit = makeBtn("Editar", async () => {
      const updated = promptEditAttachment(att);
      if (!updated) return;

      try {
        await updateAttachment(key, updated);

        refreshAttachmentsPanel(row, key);
        refreshLineAttachmentsCount(row, key);

        // refresca progreso (0/5, etc.)
        loadFunnel(row.dataset.funnelName || "TOFU");
      } catch (e) {
        alert(e?.message || String(e));
      }
    }, "btn btn-small"); 

 const btnDel = makeBtn("Borrar", async () => {
      const ok = confirm("¿Borrar este archivo adjunto?");
      if (!ok) return;

      try {
        await deleteAttachment(key, att.id);

        refreshAttachmentsPanel(row, key);
        refreshLineAttachmentsCount(row, key);
        loadFunnel(row.dataset.funnelName || "TOFU");
      } catch (e) {
        alert(e?.message || String(e));
      }
    }, "btn btn-small btn-danger");

  actions.appendChild(btnOpen);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    item.appendChild(link);
    item.appendChild(actions);

    list.appendChild(item);
  });

  panel.appendChild(list);
}
// Reaccionar a login/logout (Magic Link)
sb.auth.onAuthStateChange(async (_event, _session) => {
  STORE_LOADED = false;
  STORE_CACHE = {};
  Object.keys(STAGE_LOADED).forEach(k => delete STAGE_LOADED[k]);

  await ensureStoreLoaded();
  await renderAuthBar();
  loadFunnel("TOFU");
});


// funciones que se llaman desde index.html o desde otros js
window.renderAuthBar = renderAuthBar;
window.ensureStoreLoaded = ensureStoreLoaded;
window.loadFunnel = loadFunnel;
