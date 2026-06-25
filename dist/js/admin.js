import { database } from "./supabase-client.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
let token = sessionStorage.getItem("ag-admin-token") || "";
let vehicles = [];
let financingLeads = [];
let deletingId = null;
let photoItems = [];
let originalImages = [];
let draggedPhotoId = "";

const statusLabels = { available: "Disponível", reserved: "Reservado", sold: "Vendido" };
const leadStatusLabels = { novo: "Novo", em_atendimento: "Em atendimento", finalizado: "Finalizado" };
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

function message(selector, text = "") { $(selector).textContent = text; }
function toast(text) { const element = $("#admin-toast"); element.textContent = text; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 3200); }
function setSession(authToken) { token = authToken; sessionStorage.setItem("ag-admin-token", authToken); }
function showLogin() { $("#login-view").hidden = false; $("#admin-view").hidden = true; }
function showAdmin() { $("#login-view").hidden = true; $("#admin-view").hidden = false; loadVehicles(); loadFinancingLeads(); }
function formatCPF(value = "") { return String(value).replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2"); }
function formatPhone(value = "") { return String(value).replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2"); }

async function loadVehicles() {
  try { vehicles = await database.listVehicles({ includeInactive: true, token }); render(); }
  catch (error) { if (/jwt|token|unauthorized/i.test(error.message)) { sessionStorage.removeItem("ag-admin-token"); showLogin(); } else toast(error.message); }
}

async function loadFinancingLeads() {
  try { financingLeads = await database.listFinancingLeads(token); renderFinancingLeads(); }
  catch (error) { if (/jwt|token|unauthorized/i.test(error.message)) { sessionStorage.removeItem("ag-admin-token"); showLogin(); } else toast(error.message); }
}

function render() {
  const query = $("#admin-search").value.toLowerCase(); const status = $("#admin-status").value;
  const filtered = vehicles.filter(v => (!query || `${v.brand} ${v.model}`.toLowerCase().includes(query)) && (!status || v.status === status));
  $("#admin-list").innerHTML = filtered.map(v => `<tr><td><div class="admin-vehicle"><img src="${escapeHTML(v.cover || "")}" alt=""><div><strong>${escapeHTML(v.brand)} ${escapeHTML(v.model)}</strong><small>${escapeHTML(v.color || "")}</small></div></div></td><td>${v.year}/${v.model_year || v.modelYear || v.year}</td><td><strong>${money.format(v.price)}</strong></td><td><span class="status-pill ${escapeHTML(v.status)}">${statusLabels[v.status] || v.status}</span></td><td>${v.featured ? "Sim" : "—"}</td><td><div class="table-actions"><button class="icon-button" data-edit="${v.id}" type="button">Editar</button><button class="icon-button delete" data-delete="${v.id}" type="button">Excluir</button></div></td></tr>`).join("");
  $("#admin-empty").hidden = filtered.length > 0;
  $("#stat-total").textContent = vehicles.length;
  ["available","reserved","sold"].forEach(statusName => $(`#stat-${statusName}`).textContent = vehicles.filter(v => v.status === statusName).length);
}

function renderFinancingLeads() {
  const query = ($("#lead-search")?.value || "").toLowerCase().replace(/\D/g, "");
  const rawQuery = ($("#lead-search")?.value || "").toLowerCase();
  const status = $("#lead-status-filter")?.value || "";
  const filtered = financingLeads.filter(lead => {
    const text = `${lead.vehicle_title || ""} ${lead.vehicle_id || ""}`.toLowerCase();
    const digits = `${lead.cpf || ""} ${lead.phone || ""}`.replace(/\D/g, "");
    return (!status || lead.status === status) && (!rawQuery || text.includes(rawQuery) || digits.includes(query));
  });
  $("#lead-list").innerHTML = filtered.map(lead => `<tr><td><div class="lead-vehicle"><strong>${escapeHTML(lead.vehicle_title)}</strong><small>${money.format(lead.vehicle_price)} • ${escapeHTML(lead.vehicle_id || "")}</small></div></td><td>${escapeHTML(formatCPF(lead.cpf))}</td><td>${lead.birth_date ? new Date(`${lead.birth_date}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>${lead.has_cnh ? "Sim" : "Não"}</td><td><a href="https://wa.me/55${escapeHTML(lead.phone)}" target="_blank" rel="noopener">${escapeHTML(formatPhone(lead.phone))}</a></td><td>${lead.created_at ? dateTime.format(new Date(lead.created_at)) : "—"}</td><td><select class="lead-status-select" data-lead-status="${escapeHTML(lead.id)}">${Object.entries(leadStatusLabels).map(([value,label]) => `<option value="${value}" ${lead.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td></tr>`).join("");
  $("#lead-empty").hidden = filtered.length > 0;
  [["new","novo"],["contacting","em_atendimento"],["finished","finalizado"]].forEach(([elementId,statusName]) => $(`#lead-${elementId}`).textContent = financingLeads.filter(lead => lead.status === statusName).length);
}

function switchView(view) {
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".inventory-view").forEach(element => { element.hidden = view !== "inventory"; });
  $("#financing-view").hidden = view !== "financing";
  if (view === "financing") loadFinancingLeads();
}

function openForm(vehicle = null) {
  photoItems.filter(item => item.type === "file").forEach(item => URL.revokeObjectURL(item.preview));
  $("#vehicle-form").reset(); photoItems = []; originalImages = [];
  $("#form-title").textContent = vehicle ? "Editar veículo" : "Cadastrar veículo";
  $("#vehicle-id").value = vehicle?.id || "";
  if (vehicle) {
    $("#admin-brand").value = vehicle.brand || ""; $("#admin-model").value = vehicle.model || ""; $("#admin-year").value = vehicle.year || ""; $("#admin-model-year").value = vehicle.model_year || vehicle.modelYear || vehicle.year || ""; $("#admin-price").value = vehicle.price || ""; $("#admin-mileage").value = vehicle.mileage || ""; $("#admin-transmission").value = vehicle.transmission || ""; $("#admin-fuel").value = vehicle.fuel || ""; $("#admin-color").value = vehicle.color || ""; $("#admin-form-status").value = vehicle.status || "available"; $("#admin-description").value = vehicle.description || ""; $("#admin-features").value = (vehicle.features || []).join("\n"); $("#admin-featured").checked = Boolean(vehicle.featured); originalImages = [...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean); photoItems = originalImages.map(url => ({ id: crypto.randomUUID(), type: "url", value: url, preview: url }));
  }
  renderExistingImages(); message("#vehicle-message"); $("#vehicle-form-modal").showModal();
}

function renderExistingImages() { $("#existing-images").innerHTML = photoItems.map((item,index) => `<div class="existing-image" draggable="true" data-photo-id="${item.id}"><span class="drag-handle" title="Arraste para ordenar" aria-hidden="true">⠿</span>${index === 0 ? '<span class="cover-label">Capa principal</span>' : `<span class="photo-position">${index + 1}</span>`}<img src="${escapeHTML(item.preview)}" alt="Foto ${index+1}"><button type="button" data-remove-photo="${item.id}" aria-label="Remover foto">×</button></div>`).join(""); }
function slugify(text) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

$("#login-form").addEventListener("submit", async event => { event.preventDefault(); message("#login-message", "Entrando..."); try { const session = await database.signIn($("#login-email").value, $("#login-password").value); setSession(session.access_token); message("#login-message"); showAdmin(); } catch (error) { message("#login-message", error.message); } });
$("#logout-button").addEventListener("click", () => { sessionStorage.removeItem("ag-admin-token"); token = ""; showLogin(); });
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#refresh-leads").addEventListener("click", loadFinancingLeads);
$("#new-vehicle").addEventListener("click", () => openForm());
["#admin-search", "#admin-status"].forEach(selector => $(selector).addEventListener("input", render));
["#lead-search", "#lead-status-filter"].forEach(selector => $(selector).addEventListener("input", renderFinancingLeads));
$("#admin-list").addEventListener("click", event => { const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]"); if (edit) openForm(vehicles.find(v => String(v.id) === edit.dataset.edit)); if (remove) { deletingId = remove.dataset.delete; $("#delete-modal").showModal(); } });
$("#lead-list").addEventListener("change", async event => {
  const select = event.target.closest("[data-lead-status]"); if (!select) return;
  try { await database.updateFinancingLeadStatus(select.dataset.leadStatus, select.value, token); toast("Status do lead atualizado."); loadFinancingLeads(); }
  catch (error) { toast(error.message); }
});
document.querySelectorAll(".admin-modal-close").forEach(button => button.addEventListener("click", () => $("#vehicle-form-modal").close()));
$("#existing-images").insertAdjacentHTML("beforebegin", '<p class="photo-order-help">Arraste as fotos para organizar. A primeira imagem será a capa principal do veículo.</p>');
$("#admin-images").addEventListener("change", event => {
  [...event.target.files].forEach(file => photoItems.push({ id: crypto.randomUUID(), type: "file", value: file, preview: URL.createObjectURL(file) }));
  event.target.value = ""; renderExistingImages();
});
$("#existing-images").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-photo]"); if (!button) return;
  const index = photoItems.findIndex(item => item.id === button.dataset.removePhoto); if (index < 0) return;
  const [removed] = photoItems.splice(index, 1); if (removed.type === "file") URL.revokeObjectURL(removed.preview); renderExistingImages();
});
$("#existing-images").addEventListener("dragstart", event => {
  const item = event.target.closest("[data-photo-id]"); if (!item) return;
  draggedPhotoId = item.dataset.photoId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedPhotoId);
  requestAnimationFrame(() => item.classList.add("dragging"));
});
$("#existing-images").addEventListener("dragover", event => {
  const target = event.target.closest("[data-photo-id]"); if (!target || target.dataset.photoId === draggedPhotoId) return;
  event.preventDefault(); event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".existing-image.drag-target").forEach(item => item.classList.remove("drag-target")); target.classList.add("drag-target");
});
$("#existing-images").addEventListener("drop", event => {
  const target = event.target.closest("[data-photo-id]"); if (!target || target.dataset.photoId === draggedPhotoId) return;
  event.preventDefault(); const from = photoItems.findIndex(item => item.id === draggedPhotoId); if (from < 0) return;
  const [moved] = photoItems.splice(from, 1); let to = photoItems.findIndex(item => item.id === target.dataset.photoId);
  const rect = target.getBoundingClientRect(); if (event.clientX > rect.left + rect.width / 2) to += 1;
  photoItems.splice(Math.max(0, to), 0, moved); renderExistingImages();
});
$("#existing-images").addEventListener("dragend", () => {
  draggedPhotoId = ""; document.querySelectorAll(".existing-image.dragging,.existing-image.drag-target").forEach(item => item.classList.remove("dragging", "drag-target"));
});
$("#cancel-delete").addEventListener("click", () => $("#delete-modal").close());
$("#confirm-delete").addEventListener("click", async () => { try { const vehicle = vehicles.find(item => String(item.id) === String(deletingId)); await database.deleteVehicle(deletingId, token); if (vehicle) await Promise.allSettled([...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean).map(url => database.deleteImage(url, token))); $("#delete-modal").close(); toast("Veículo excluído."); loadVehicles(); } catch (error) { toast(error.message); } });
$("#vehicle-form").addEventListener("submit", async event => {
  event.preventDefault(); message("#vehicle-message", "Salvando...");
  try {
    const images = await Promise.all(photoItems.map(item => item.type === "url" ? item.value : database.uploadImage(item.value, token)));
    if (!images.length) throw new Error("Adicione ao menos uma foto do veículo.");
    const brand = $("#admin-brand").value.trim(); const model = $("#admin-model").value.trim(); const year = Number($("#admin-year").value);
    const payload = { id: $("#vehicle-id").value || undefined, slug: `${slugify(brand)}-${slugify(model)}-${year}-${Date.now().toString().slice(-5)}`, brand, model, year, model_year: Number($("#admin-model-year").value), price: Number($("#admin-price").value), mileage: Number($("#admin-mileage").value) || null, transmission: $("#admin-transmission").value.trim(), fuel: $("#admin-fuel").value.trim(), color: $("#admin-color").value.trim(), status: $("#admin-form-status").value, description: $("#admin-description").value.trim(), features: $("#admin-features").value.split("\n").map(v => v.trim()).filter(Boolean), featured: $("#admin-featured").checked, cover: images[0], images };
    if (payload.id) delete payload.slug;
    await database.saveVehicle(payload, token);
    const removedImages = originalImages.filter(url => !images.includes(url));
    await Promise.allSettled(removedImages.map(url => database.deleteImage(url, token)));
    $("#vehicle-form-modal").close(); toast("Veículo salvo com sucesso."); loadVehicles();
  } catch (error) { message("#vehicle-message", error.message); }
});

if (!database.configured) { $("#config-alert").hidden = false; $("#login-form button").disabled = true; }
if (token && database.configured) showAdmin(); else showLogin();
