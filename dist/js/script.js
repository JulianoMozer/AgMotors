import { fallbackVehicles } from "./inventory.js";
import { database } from "./supabase-client.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
let vehicles = [];
const whatsappNumber = "5541996155327";
const whatsappUrl = message => `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
const generalWhatsAppMessage = "Olá, vim pelo site da AG Motors e gostaria de atendimento.";
const vehicleWhatsAppMessage = vehicle => `Olá, tenho interesse no ${vehicle.brand} ${vehicle.model} anunciado no site da AG Motors.`;

function initializeWhatsAppLinks() {
  document.querySelectorAll(`a[href^="https://wa.me/${whatsappNumber}"]`).forEach(link => {
    if (!new URL(link.href).searchParams.has("text")) link.href = whatsappUrl(generalWhatsAppMessage);
  });
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function normalizeVehicle(vehicle) {
  return { ...vehicle, modelYear: vehicle.modelYear || vehicle.model_year || vehicle.year, images: Array.isArray(vehicle.images) ? vehicle.images : [], features: Array.isArray(vehicle.features) ? vehicle.features : [] };
}

async function loadVehicles() {
  if (database.configured) {
    try { vehicles = (await database.listVehicles()).map(normalizeVehicle); }
    catch { vehicles = fallbackVehicles; showToast("Estoque temporariamente carregado do catálogo local."); }
  } else vehicles = fallbackVehicles;
  populateBrands();
  renderVehicles();
  openVehicleFromHash();
}

function vehicleCard(vehicle) {
  const unavailable = vehicle.status !== "available";
  return `<article class="vehicle-card">
    <button class="vehicle-cover" type="button" data-vehicle="${escapeHTML(vehicle.id)}" aria-label="Ver detalhes de ${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}">
      <img src="${escapeHTML(vehicle.cover)}" alt="${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}" width="640" height="480" loading="lazy">
      ${vehicle.featured ? '<span class="card-tag">Destaque</span>' : ""}${unavailable ? `<span class="card-status">${vehicle.status === "sold" ? "Vendido" : "Reservado"}</span>` : ""}
    </button>
    <div class="vehicle-body"><div class="vehicle-title"><small>${escapeHTML(vehicle.brand)}</small><h3>${escapeHTML(vehicle.model)}</h3></div>
    <div class="vehicle-price"><span>Preço à vista</span><strong>${money.format(vehicle.price)}</strong></div>
    <ul class="vehicle-specs"><li><span>Ano</span><strong>${vehicle.year}/${vehicle.modelYear || vehicle.year}</strong></li><li><span>Km</span><strong>${vehicle.mileage ? number.format(vehicle.mileage) : "Consulte"}</strong></li><li><span>Câmbio</span><strong>${escapeHTML(vehicle.transmission || "Consulte")}</strong></li></ul>
    <div class="card-actions"><button class="card-link" type="button" data-vehicle="${escapeHTML(vehicle.id)}"><span>Conhecer este veículo</span><span aria-hidden="true">→</span></button><a class="card-whatsapp" href="${whatsappUrl(vehicleWhatsAppMessage(vehicle))}" target="_blank" rel="noopener noreferrer" aria-label="Perguntar pelo ${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)} no WhatsApp">WhatsApp</a></div></div>
  </article>`;
}

function filteredVehicles() {
  const query = $("#vehicle-search").value.trim().toLocaleLowerCase("pt-BR");
  const brand = $("#brand-filter").value;
  const sort = $("#sort-filter").value;
  const result = vehicles.filter(v => (!query || `${v.brand} ${v.model}`.toLocaleLowerCase("pt-BR").includes(query)) && (!brand || v.brand === brand));
  result.sort((a, b) => sort === "price-asc" ? a.price - b.price : sort === "price-desc" ? b.price - a.price : sort === "year-desc" ? b.year - a.year : Number(b.featured) - Number(a.featured));
  return result;
}

function renderVehicles() {
  const result = filteredVehicles();
  $("#vehicle-grid").innerHTML = result.map(vehicleCard).join("");
  $("#vehicle-count").textContent = `${result.length} ${result.length === 1 ? "veículo" : "veículos"}`;
  $("#empty-state").hidden = result.length > 0;
}

function populateBrands() {
  const brands = [...new Set(vehicles.map(v => v.brand))].sort();
  $("#brand-filter").insertAdjacentHTML("beforeend", brands.map(brand => `<option>${escapeHTML(brand)}</option>`).join(""));
}

function openVehicle(id) {
  const vehicle = vehicles.find(item => String(item.id) === String(id));
  if (!vehicle) return;
  const gallery = [...new Set([vehicle.cover, ...vehicle.images])].filter(Boolean);
  const message = encodeURIComponent(vehicleWhatsAppMessage(vehicle));
  $("#vehicle-detail").innerHTML = `<div class="detail-gallery"><img class="detail-main" src="${escapeHTML(gallery[0])}" alt="${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}"><div class="detail-thumbs">${gallery.map((image, index) => `<button type="button" data-image="${escapeHTML(image)}" aria-label="Exibir foto ${index + 1}"><img src="${escapeHTML(image)}" alt="" loading="lazy"></button>`).join("")}</div></div><div class="detail-copy"><header class="detail-header"><div><span class="eyebrow">${escapeHTML(vehicle.brand)}</span><h2>${escapeHTML(vehicle.model)}</h2></div><span class="detail-availability">Disponível</span><div class="detail-price-card"><small>Preço à vista</small><strong>${money.format(vehicle.price)}</strong></div></header><section class="detail-spec-section"><h3>Dados do veículo</h3><dl><div><dt>Ano</dt><dd>${vehicle.year}/${vehicle.modelYear || vehicle.year}</dd></div><div><dt>Quilometragem</dt><dd>${vehicle.mileage ? `${number.format(vehicle.mileage)} km` : "Consulte"}</dd></div><div><dt>Câmbio</dt><dd>${escapeHTML(vehicle.transmission || "Consulte")}</dd></div><div><dt>Combustível</dt><dd>${escapeHTML(vehicle.fuel || "Consulte")}</dd></div><div><dt>Cor</dt><dd>${escapeHTML(vehicle.color || "Consulte")}</dd></div></dl></section><details class="detail-panel"><summary><span>Sobre este veículo</span><small>Ver descrição completa</small></summary><p>${escapeHTML(vehicle.description || "Fale com nossa equipe para conhecer todos os detalhes deste veículo.")}</p></details>${vehicle.features.length ? `<details class="detail-panel"><summary><span>Itens e diferenciais</span><small>${vehicle.features.length} itens</small></summary><ul class="feature-list">${vehicle.features.map(feature => `<li>${escapeHTML(feature)}</li>`).join("")}</ul></details>` : ""}<div class="detail-cta"><p>Gostou deste veículo?</p><a class="button button-primary button-full" href="https://wa.me/5541996155327?text=${message}" target="_blank" rel="noopener noreferrer">Falar com um consultor</a></div></div>`;
  $("#vehicle-modal").showModal();
  history.replaceState(null, "", `#veiculo=${vehicle.slug || vehicle.id}`);
}

function openVehicleFromHash() {
  if (!location.hash.startsWith("#veiculo=")) return;
  const slug = decodeURIComponent(location.hash.split("=")[1]);
  const vehicle = vehicles.find(item => item.slug === slug || String(item.id) === slug);
  if (vehicle) openVehicle(vehicle.id);
}

function calculateFinance() {
  const total = Number($("#finance-value").value) || 0;
  const down = Math.min(Number($("#finance-down").value) || 0, total);
  const months = Number($("#finance-term").value);
  const monthlyRate = 0.0199;
  const financed = Math.max(total - down, 0);
  const installment = financed ? financed * (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1) : 0;
  $("#finance-result").textContent = money.format(installment);
  return { total, down, months, installment };
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

$(".menu-toggle").addEventListener("click", event => {
  const open = event.currentTarget.getAttribute("aria-expanded") === "true";
  event.currentTarget.setAttribute("aria-expanded", String(!open)); $(".main-nav").classList.toggle("open", !open);
});
document.addEventListener("click", event => {
  const button = event.target.closest("[data-vehicle]"); if (button) openVehicle(button.dataset.vehicle);
  const image = event.target.closest("[data-image]"); if (image) $(".detail-main").src = image.dataset.image;
  if (event.target.matches(".main-nav a")) { $(".main-nav").classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false"); }
});
["#vehicle-search", "#brand-filter", "#sort-filter"].forEach(selector => $(selector).addEventListener("input", renderVehicles));
["#finance-value", "#finance-down", "#finance-term"].forEach(selector => $(selector).addEventListener("input", calculateFinance));
$("#finance-form").addEventListener("submit", event => { event.preventDefault(); const value = calculateFinance(); const text = encodeURIComponent(`Olá! Fiz uma simulação no site da AG Motors. Veículo: ${money.format(value.total)}, entrada: ${money.format(value.down)}, prazo: ${value.months} meses, parcela estimada: ${money.format(value.installment)}. Gostaria de consultar as condições.`); window.open(`https://wa.me/5541996155327?text=${text}`, "_blank", "noopener"); });
$("#sell-form").addEventListener("submit", event => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const text = encodeURIComponent(`Olá! Quero avaliar meu carro.\n\nNome: ${$("#sell-name").value}\nWhatsApp: ${$("#sell-phone").value}\nVeículo: ${$("#sell-brand").value} ${$("#sell-model").value}\nAno: ${$("#sell-year").value}\nQuilometragem: ${$("#sell-mileage").value}\nObservações: ${$("#sell-notes").value || "Não informado"}`); window.open(`https://wa.me/5541996155327?text=${text}`, "_blank", "noopener"); });
$("#sell-phone").addEventListener("input", event => { const digits = event.target.value.replace(/\D/g, "").slice(0, 11); event.target.value = digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2"); });
$(".modal-close").addEventListener("click", () => $("#vehicle-modal").close());
$("#vehicle-modal").addEventListener("close", () => { if (location.hash.startsWith("#veiculo=")) history.replaceState(null, "", `${location.pathname}${location.search}`); });
$("#vehicle-modal").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("#current-year").textContent = new Date().getFullYear();
initializeWhatsAppLinks();
calculateFinance();
loadVehicles();
