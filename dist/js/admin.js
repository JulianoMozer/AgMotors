import { database } from "./supabase-client.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let token = sessionStorage.getItem("ag-admin-token") || "";
let vehicles = [];
let deletingId = null;
let retainedImages = [];
let originalImages = [];

const statusLabels = { available: "Disponível", reserved: "Reservado", sold: "Vendido" };
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

function message(selector, text = "") { $(selector).textContent = text; }
function toast(text) { const element = $("#admin-toast"); element.textContent = text; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 3200); }
function setSession(authToken) { token = authToken; sessionStorage.setItem("ag-admin-token", authToken); }
function showLogin() { $("#login-view").hidden = false; $("#admin-view").hidden = true; }
function showAdmin() { $("#login-view").hidden = true; $("#admin-view").hidden = false; loadVehicles(); }

async function loadVehicles() {
  try { vehicles = await database.listVehicles({ includeInactive: true, token }); render(); }
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

function openForm(vehicle = null) {
  $("#vehicle-form").reset(); retainedImages = []; originalImages = [];
  $("#form-title").textContent = vehicle ? "Editar veículo" : "Cadastrar veículo";
  $("#vehicle-id").value = vehicle?.id || "";
  if (vehicle) {
    $("#admin-brand").value = vehicle.brand || ""; $("#admin-model").value = vehicle.model || ""; $("#admin-year").value = vehicle.year || ""; $("#admin-model-year").value = vehicle.model_year || vehicle.modelYear || vehicle.year || ""; $("#admin-price").value = vehicle.price || ""; $("#admin-mileage").value = vehicle.mileage || ""; $("#admin-transmission").value = vehicle.transmission || ""; $("#admin-fuel").value = vehicle.fuel || ""; $("#admin-color").value = vehicle.color || ""; $("#admin-form-status").value = vehicle.status || "available"; $("#admin-description").value = vehicle.description || ""; $("#admin-features").value = (vehicle.features || []).join("\n"); $("#admin-featured").checked = Boolean(vehicle.featured); retainedImages = [...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean); originalImages = [...retainedImages];
  }
  renderExistingImages(); message("#vehicle-message"); $("#vehicle-form-modal").showModal();
}

function renderExistingImages() { $("#existing-images").innerHTML = retainedImages.map((url,index) => `<div class="existing-image"><img src="${escapeHTML(url)}" alt="Foto ${index+1}"><button type="button" data-remove-image="${index}" aria-label="Remover foto">×</button></div>`).join(""); }
function slugify(text) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

$("#login-form").addEventListener("submit", async event => { event.preventDefault(); message("#login-message", "Entrando..."); try { const session = await database.signIn($("#login-email").value, $("#login-password").value); setSession(session.access_token); message("#login-message"); showAdmin(); } catch (error) { message("#login-message", error.message); } });
$("#logout-button").addEventListener("click", () => { sessionStorage.removeItem("ag-admin-token"); token = ""; showLogin(); });
$("#new-vehicle").addEventListener("click", () => openForm());
["#admin-search", "#admin-status"].forEach(selector => $(selector).addEventListener("input", render));
$("#admin-list").addEventListener("click", event => { const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]"); if (edit) openForm(vehicles.find(v => String(v.id) === edit.dataset.edit)); if (remove) { deletingId = remove.dataset.delete; $("#delete-modal").showModal(); } });
document.querySelectorAll(".admin-modal-close").forEach(button => button.addEventListener("click", () => $("#vehicle-form-modal").close()));
$("#existing-images").addEventListener("click", event => { const button = event.target.closest("[data-remove-image]"); if (!button) return; retainedImages.splice(Number(button.dataset.removeImage),1); renderExistingImages(); });
$("#cancel-delete").addEventListener("click", () => $("#delete-modal").close());
$("#confirm-delete").addEventListener("click", async () => { try { const vehicle = vehicles.find(item => String(item.id) === String(deletingId)); await database.deleteVehicle(deletingId, token); if (vehicle) await Promise.allSettled([...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean).map(url => database.deleteImage(url, token))); $("#delete-modal").close(); toast("Veículo excluído."); loadVehicles(); } catch (error) { toast(error.message); } });
$("#vehicle-form").addEventListener("submit", async event => {
  event.preventDefault(); message("#vehicle-message", "Salvando...");
  try {
    const files = [...$("#admin-images").files];
    const uploaded = await Promise.all(files.map(file => database.uploadImage(file, token)));
    const images = [...retainedImages, ...uploaded];
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
