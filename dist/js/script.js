import { fallbackVehicles } from "./inventory.js";
import { database } from "./supabase-client.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
let vehicles = [];
let activePriceRange = null;
let currentGallery = [];
let currentGalleryIndex = 0;
let currentGalleryTitle = "";
let currentLeadVehicle = null;
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

function digitsOnly(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatCPF(value) {
  return digitsOnly(value).slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatPhone(value) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2");
}

function setFinanceLeadState(state = "form") {
  const form = $("#finance-lead-form");
  const success = $("#finance-lead-success");
  const successVisible = state === "success";
  form.hidden = successVisible;
  success.hidden = !successVisible;
  form.style.display = successVisible ? "none" : "";
  success.style.display = successVisible ? "" : "none";
}

function normalizeVehicle(vehicle) {
  return { ...vehicle, modelYear: vehicle.modelYear || vehicle.model_year || vehicle.year, images: Array.isArray(vehicle.images) ? vehicle.images : [], features: Array.isArray(vehicle.features) ? vehicle.features : [] };
}

function vehicleBadges(vehicle) {
  const text = `${vehicle.description || ""} ${(vehicle.features || []).join(" ")}`.toLocaleLowerCase("pt-BR");
  const badges = [];
  if (vehicle.featured) badges.push("Destaque");
  if (vehicle.created_at && Date.now() - new Date(vehicle.created_at).getTime() < 30 * 864e5) badges.push("Novidade");
  if (text.includes("oferta")) badges.push("Oferta");
  if (text.includes("premium")) badges.push("Premium");
  return badges.slice(0, 2);
}

function vehicleBenefits(vehicle) {
  const text = `${vehicle.description || ""} ${(vehicle.features || []).join(" ")}`.toLocaleLowerCase("pt-BR");
  return [["laudo", "Laudo cautelar"], ["financ", "Aceita financiamento"], ["troca", "Aceita troca"]].filter(([term]) => text.includes(term)).map(([, label]) => label).slice(0, 2);
}

function similarVehicles(vehicle) {
  return vehicles
    .filter(item => String(item.id) !== String(vehicle.id) && item.status === "available")
    .map(item => {
      const priceDistance = Math.abs((item.price || 0) - (vehicle.price || 0));
      const score = (item.brand === vehicle.brand ? 45 : 0) + (priceDistance <= 20000 ? 35 : priceDistance <= 40000 ? 18 : 0) + (item.featured ? 12 : 0);
      return { item, score, priceDistance };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.priceDistance - b.priceDistance)
    .slice(0, 4)
    .map(({ item }) => item);
}

function similarVehicleCard(vehicle) {
  return `<article class="similar-card"><button type="button" data-vehicle="${escapeHTML(vehicle.id)}"><img src="${escapeHTML(vehicle.cover)}" alt="${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}" loading="lazy"><span><small>${escapeHTML(vehicle.brand)}</small><strong>${escapeHTML(vehicle.model)}</strong><em>${money.format(vehicle.price)}</em></span></button></article>`;
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
  const badges = vehicleBadges(vehicle);
  const benefits = vehicleBenefits(vehicle);
  return `<article class="vehicle-card">
    <button class="vehicle-cover" type="button" data-vehicle="${escapeHTML(vehicle.id)}" aria-label="Ver detalhes de ${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}">
      <img src="${escapeHTML(vehicle.cover)}" alt="${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}" width="640" height="480" loading="lazy">
      ${badges.length ? `<span class="card-tags">${badges.map(badge => `<span class="card-tag card-tag-${badge.toLowerCase()}">${badge}</span>`).join("")}</span>` : ""}${unavailable ? `<span class="card-status">${vehicle.status === "sold" ? "Vendido" : "Reservado"}</span>` : ""}
    </button>
    <div class="vehicle-body"><div class="vehicle-title"><small>${escapeHTML(vehicle.brand)}</small><h3>${escapeHTML(vehicle.model)}</h3></div>
    <div class="vehicle-price"><span>Preço à vista</span><strong>${money.format(vehicle.price)}</strong></div>
    <ul class="vehicle-specs"><li><span>Ano</span><strong>${vehicle.year}/${vehicle.modelYear || vehicle.year}</strong></li><li><span>Km</span><strong>${vehicle.mileage ? number.format(vehicle.mileage) : "Consulte"}</strong></li><li><span>Câmbio</span><strong>${escapeHTML(vehicle.transmission || "Consulte")}</strong></li></ul>${benefits.length ? `<ul class="vehicle-benefits">${benefits.map(benefit => `<li>${benefit}</li>`).join("")}</ul>` : ""}
    <div class="card-actions"><button class="card-link" type="button" data-vehicle="${escapeHTML(vehicle.id)}"><span>Conhecer este veículo</span><span aria-hidden="true">→</span></button><a class="card-whatsapp" href="${whatsappUrl(vehicleWhatsAppMessage(vehicle))}" target="_blank" rel="noopener noreferrer" aria-label="Perguntar pelo ${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)} no WhatsApp">WhatsApp</a></div></div>
  </article>`;
}

function filteredVehicles() {
  const query = $("#vehicle-search").value.trim().toLocaleLowerCase("pt-BR");
  const brand = $("#brand-filter").value;
  const sort = $("#sort-filter").value;
  const result = vehicles.filter(v => (!query || `${v.brand} ${v.model}`.toLocaleLowerCase("pt-BR").includes(query)) && (!brand || v.brand === brand) && (!activePriceRange || (v.price >= activePriceRange.min && (activePriceRange.max === null || v.price <= activePriceRange.max))));
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
  const title = `${vehicle.brand} ${vehicle.model}`;
  const similar = similarVehicles(vehicle);
  $("#vehicle-detail").innerHTML = `<div class="detail-gallery"><button class="detail-main-button" type="button" data-gallery-index="0" aria-label="Ampliar foto principal"><img class="detail-main" src="${escapeHTML(gallery[0])}" alt="${escapeHTML(title)}"></button><div class="detail-thumbs">${gallery.map((image, index) => `<button type="button" data-image="${escapeHTML(image)}" data-gallery-index="${index}" aria-label="Exibir foto ${index + 1}"><img src="${escapeHTML(image)}" alt="" loading="lazy"></button>`).join("")}</div></div><div class="detail-copy"><header class="detail-header"><div><span class="eyebrow">${escapeHTML(vehicle.brand)}</span><h2>${escapeHTML(vehicle.model)}</h2></div><span class="detail-availability">Disponível</span><div class="detail-price-card"><small>Preço à vista</small><strong>${money.format(vehicle.price)}</strong></div></header><section class="detail-spec-section"><h3>Dados do veículo</h3><dl><div><dt>Ano</dt><dd>${vehicle.year}/${vehicle.modelYear || vehicle.year}</dd></div><div><dt>Quilometragem</dt><dd>${vehicle.mileage ? `${number.format(vehicle.mileage)} km` : "Consulte"}</dd></div><div><dt>Câmbio</dt><dd>${escapeHTML(vehicle.transmission || "Consulte")}</dd></div><div><dt>Combustível</dt><dd>${escapeHTML(vehicle.fuel || "Consulte")}</dd></div><div><dt>Cor</dt><dd>${escapeHTML(vehicle.color || "Consulte")}</dd></div></dl></section><details class="detail-panel"><summary><span>Sobre este veículo</span><small>Ver descrição completa</small></summary><p>${escapeHTML(vehicle.description || "Fale com nossa equipe para conhecer todos os detalhes deste veículo.")}</p></details>${vehicle.features.length ? `<details class="detail-panel"><summary><span>Itens e diferenciais</span><small>${vehicle.features.length} itens</small></summary><ul class="feature-list">${vehicle.features.map(feature => `<li>${escapeHTML(feature)}</li>`).join("")}</ul></details>` : ""}${similar.length ? `<section class="similar-vehicles"><div><span class="eyebrow">Continue pesquisando</span><h3>Veículos semelhantes</h3></div><div class="similar-grid">${similar.map(similarVehicleCard).join("")}</div></section>` : ""}<div class="detail-cta"><p>Gostou deste veículo?</p><a class="button button-primary button-full" href="https://wa.me/5541996155327?text=${message}" target="_blank" rel="noopener noreferrer">Falar com um consultor</a></div></div>`;
  const cta = $(".detail-cta");
  cta.querySelector("p").textContent = "Quer saber se este veículo aprova para você?";
  cta.querySelector("a").insertAdjacentHTML("beforebegin", `<button class="button button-primary button-full finance-lead-trigger" type="button" data-finance-lead="${escapeHTML(vehicle.id)}">Descobrir se consigo financiar este veículo</button>`);
  cta.querySelector("a").classList.replace("button-primary", "button-ghost");
  currentGallery = gallery;
  currentGalleryIndex = 0;
  currentGalleryTitle = title;
  if (!$("#vehicle-modal").open) $("#vehicle-modal").showModal();
  history.replaceState(null, "", `#veiculo=${vehicle.slug || vehicle.id}`);
}

function openVehicleFromHash() {
  if (!location.hash.startsWith("#veiculo=")) return;
  const slug = decodeURIComponent(location.hash.split("=")[1]);
  const vehicle = vehicles.find(item => item.slug === slug || String(item.id) === slug);
  if (vehicle) openVehicle(vehicle.id);
}

function openFinanceLead(vehicleId) {
  const vehicle = vehicles.find(item => String(item.id) === String(vehicleId));
  if (!vehicle) return;
  currentLeadVehicle = vehicle;
  $("#finance-lead-form").reset();
  setFinanceLeadState("form");
  $("#finance-lead-message").textContent = "";
  $("#finance-lead-vehicle").innerHTML = `<strong>${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}</strong><span>${money.format(vehicle.price)} • Código ${escapeHTML(vehicle.slug || vehicle.id)}</span>`;
  $("#finance-lead-modal").showModal();
}

async function submitFinanceLead(event) {
  event.preventDefault();
  if (!currentLeadVehicle || !event.currentTarget.reportValidity()) return;
  const cpf = digitsOnly($("#lead-cpf").value);
  const phone = digitsOnly($("#lead-phone").value);
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  if (cpf.length !== 11) { $("#finance-lead-message").textContent = "Informe um CPF válido."; return; }
  if (phone.length < 10) { $("#finance-lead-message").textContent = "Informe um celular válido."; return; }
  $("#finance-lead-message").textContent = "Enviando solicitação...";
  if (submitButton) submitButton.disabled = true;
  try {
    await database.createFinancingLead({
      vehicle_id: String(currentLeadVehicle.slug || currentLeadVehicle.id),
      vehicle_title: `${currentLeadVehicle.brand} ${currentLeadVehicle.model}`,
      vehicle_price: Number(currentLeadVehicle.price) || 0,
      cpf,
      birth_date: $("#lead-birth-date").value,
      has_cnh: event.currentTarget.elements.has_cnh.value === "true",
      phone
    });
    setFinanceLeadState("success");
  } catch (error) {
    console.error("Erro ao salvar lead de financiamento:", error);
    setFinanceLeadState("form");
    $("#finance-lead-message").textContent = "Não foi possível enviar sua solicitação agora. Tente novamente ou fale com a AG Motors pelo WhatsApp.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function calculateFinance() {
  const total = Number($("#finance-value").value) || 0;
  const down = Math.min(Number($("#finance-down").value) || 0, total);
  const months = Number($("#finance-term").value);
  const monthlyRate = 0.0299;
  const financed = Math.max(total - down, 0);
  const installment = financed ? financed * (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1) : 0;
  $("#finance-result").textContent = money.format(installment);
  return { total, down, months, installment, monthlyRate };
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function applyPriceShortcut(button) {
  activePriceRange = { min: Number(button.dataset.priceMin) || 0, max: button.dataset.priceMax ? Number(button.dataset.priceMax) : null };
  document.querySelectorAll("[data-price-min]").forEach(item => item.classList.toggle("is-active", item === button));
  const clearButton = $("[data-price-clear]");
  if (clearButton) clearButton.hidden = false;
  renderVehicles();
  $("#estoque").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearPriceShortcut() {
  activePriceRange = null;
  document.querySelectorAll("[data-price-min]").forEach(item => item.classList.remove("is-active"));
  const clearButton = $("[data-price-clear]");
  if (clearButton) clearButton.hidden = true;
  renderVehicles();
}

function updateDetailImage(button) {
  currentGalleryIndex = Number(button.dataset.galleryIndex) || 0;
  $(".detail-main").src = button.dataset.image;
  const mainButton = $(".detail-main-button");
  if (mainButton) mainButton.dataset.galleryIndex = String(currentGalleryIndex);
  document.querySelectorAll(".detail-thumbs button").forEach(item => item.classList.toggle("is-active", item === button));
}

function renderGalleryLightbox() {
  if (!currentGallery.length) return;
  const image = currentGallery[currentGalleryIndex];
  $("#gallery-image").src = image;
  $("#gallery-image").alt = `${currentGalleryTitle} - foto ${currentGalleryIndex + 1}`;
  $("#gallery-caption").textContent = `${currentGalleryTitle} • ${currentGalleryIndex + 1} de ${currentGallery.length}`;
  $("#gallery-strip").innerHTML = currentGallery.map((item, index) => `<button type="button" data-gallery-thumb="${index}" class="${index === currentGalleryIndex ? "is-active" : ""}" aria-label="Abrir foto ${index + 1}"><img src="${escapeHTML(item)}" alt="" loading="lazy"></button>`).join("");
}

function openGalleryLightbox(index = currentGalleryIndex) {
  if (!currentGallery.length) return;
  currentGalleryIndex = Math.max(0, Math.min(Number(index) || 0, currentGallery.length - 1));
  renderGalleryLightbox();
  $("#gallery-lightbox").showModal();
}

function moveGalleryLightbox(direction) {
  if (!currentGallery.length) return;
  currentGalleryIndex = (currentGalleryIndex + direction + currentGallery.length) % currentGallery.length;
  renderGalleryLightbox();
}

$(".menu-toggle").addEventListener("click", event => {
  const open = event.currentTarget.getAttribute("aria-expanded") === "true";
  event.currentTarget.setAttribute("aria-expanded", String(!open)); $(".main-nav").classList.toggle("open", !open);
});
document.addEventListener("click", event => {
  const priceButton = event.target.closest("[data-price-min]"); if (priceButton) applyPriceShortcut(priceButton);
  const clearPriceButton = event.target.closest("[data-price-clear]"); if (clearPriceButton) clearPriceShortcut();
  const button = event.target.closest("[data-vehicle]"); if (button) openVehicle(button.dataset.vehicle);
  const image = event.target.closest("[data-image]"); if (image) updateDetailImage(image);
  const financeLead = event.target.closest("[data-finance-lead]"); if (financeLead) openFinanceLead(financeLead.dataset.financeLead);
  const mainImage = event.target.closest(".detail-main-button"); if (mainImage) openGalleryLightbox(Number(mainImage.dataset.galleryIndex) || 0);
  const galleryThumb = event.target.closest("[data-gallery-thumb]"); if (galleryThumb) { currentGalleryIndex = Number(galleryThumb.dataset.galleryThumb) || 0; renderGalleryLightbox(); }
  if (event.target.closest("[data-gallery-prev]")) moveGalleryLightbox(-1);
  if (event.target.closest("[data-gallery-next]")) moveGalleryLightbox(1);
  if (event.target.closest("[data-gallery-close]")) $("#gallery-lightbox").close();
  if (event.target.closest("[data-finance-lead-done]")) $("#finance-lead-modal").close();
  if (event.target.matches(".main-nav a")) { $(".main-nav").classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false"); }
});
["#vehicle-search", "#brand-filter", "#sort-filter"].forEach(selector => $(selector).addEventListener("input", renderVehicles));
["#finance-value", "#finance-down", "#finance-term"].forEach(selector => $(selector).addEventListener("input", calculateFinance));
$("#finance-form").addEventListener("submit", event => { event.preventDefault(); const value = calculateFinance(); const text = encodeURIComponent(`Olá! Fiz uma estimativa de financiamento no site da AG Motors. Veículo: ${money.format(value.total)}, entrada: ${money.format(value.down)}, prazo: ${value.months} meses, parcela de referência: ${money.format(value.installment)} com taxa simulada de ${(value.monthlyRate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m. Gostaria de consultar as condições reais nos bancos parceiros.`); window.open(`https://wa.me/5541996155327?text=${text}`, "_blank", "noopener"); });
$("#sell-form").addEventListener("submit", event => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const text = encodeURIComponent(`Olá! Quero avaliar meu carro.\n\nNome: ${$("#sell-name").value}\nWhatsApp: ${$("#sell-phone").value}\nVeículo: ${$("#sell-brand").value} ${$("#sell-model").value}\nAno: ${$("#sell-year").value}\nQuilometragem: ${$("#sell-mileage").value}\nObservações: ${$("#sell-notes").value || "Não informado"}`); window.open(`https://wa.me/5541996155327?text=${text}`, "_blank", "noopener"); });
$("#sell-phone").addEventListener("input", event => { const digits = event.target.value.replace(/\D/g, "").slice(0, 11); event.target.value = digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2"); });
$("#lead-cpf").addEventListener("input", event => { event.target.value = formatCPF(event.target.value); });
$("#lead-phone").addEventListener("input", event => { event.target.value = formatPhone(event.target.value); });
$("#finance-lead-form").addEventListener("submit", submitFinanceLead);
$(".finance-lead-close").addEventListener("click", () => $("#finance-lead-modal").close());
$(".modal-close").addEventListener("click", () => $("#vehicle-modal").close());
$("#vehicle-modal").addEventListener("close", () => { if (location.hash.startsWith("#veiculo=")) history.replaceState(null, "", `${location.pathname}${location.search}`); });
$("#vehicle-modal").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("#finance-lead-modal").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("#gallery-lightbox").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.addEventListener("keydown", event => {
  if (!$("#gallery-lightbox").open) return;
  if (event.key === "ArrowLeft") moveGalleryLightbox(-1);
  if (event.key === "ArrowRight") moveGalleryLightbox(1);
});
$("#current-year").textContent = new Date().getFullYear();
initializeWhatsAppLinks();
calculateFinance();
loadVehicles();
