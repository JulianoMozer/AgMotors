import { database } from "./supabase-client.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const today = () => new Date().toISOString().slice(0, 10);
const fallbackCover = "img/showroom-ag-motors.jpg";
const statusLabels = { available: "Disponível", reserved: "Reservado", sold: "Vendido", hidden: "Oculto" };
const leadStatusLabels = { novo: "Novo", em_atendimento: "Em atendimento", finalizado: "Finalizado" };
const sourceLabels = { direct: "Direto", google: "Google", instagram: "Instagram", facebook: "Facebook", referral: "Indicação", other: "Outros" };

let token = sessionStorage.getItem("ag-admin-token") || "";
let vehicles = [];
let financingLeads = [];
let storeExpenses = [];
let deletingId = null;
let photoItems = [];
let originalImages = [];
let draggedPhotoId = "";
let costItems = [];
let activeVehicle = null;

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
const lastUpdateText = () => `Atualizado em ${dateTime.format(new Date())}`;
const normalizePlate = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
const toNumberOrNull = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const parseDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
const formatDate = value => {
  const date = parseDate(value);
  return date && !Number.isNaN(date.getTime()) ? dateOnly.format(date) : "Não informada";
};
const formatCPF = (value = "") => String(value).replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
const formatPhone = (value = "") => String(value).replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2");
const vehicleCosts = vehicle => Array.isArray(vehicle?.cost_items) ? vehicle.cost_items : [];
const vehicleCostTotal = vehicle => vehicleCosts(vehicle).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
const vehicleInvestment = vehicle => (Number(vehicle?.purchase_price) || 0) + vehicleCostTotal(vehicle);
const vehicleSalePrice = vehicle => Number(vehicle?.sale_price) || (vehicle?.status === "sold" ? Number(vehicle?.price) || 0 : 0);
const vehicleMargin = vehicle => {
  const salePrice = vehicleSalePrice(vehicle);
  const investment = vehicleInvestment(vehicle);
  return salePrice && investment ? salePrice - investment : null;
};
const vehicleMarginPercent = vehicle => {
  const salePrice = vehicleSalePrice(vehicle);
  const margin = vehicleMargin(vehicle);
  return salePrice && margin !== null ? (margin / salePrice) * 100 : null;
};
const vehicleDays = vehicle => {
  const start = parseDate(vehicle?.purchase_date) || (vehicle?.created_at ? new Date(vehicle.created_at) : new Date());
  const end = vehicle?.status === "sold" && vehicle?.sale_date ? parseDate(vehicle.sale_date) : new Date();
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
};

function message(selector, text = "") { $(selector).textContent = text; }
function toast(text) {
  const element = $("#admin-toast");
  element.textContent = text;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 3400);
}
function setSession(authToken) { token = authToken; sessionStorage.setItem("ag-admin-token", authToken); }
function showLogin() { $("#login-view").hidden = false; $("#admin-view").hidden = true; }
function showAdmin() {
  $("#login-view").hidden = true;
  $("#admin-view").hidden = false;
  loadVehicles();
  switchView(sessionStorage.getItem("ag-admin-view") || "inventory");
}

async function loadVehicles() {
  try {
    vehicles = await database.listVehicles({ includeInactive: true, token });
    $("#inventory-updated").textContent = lastUpdateText();
    renderInventory();
  } catch (error) {
    if (/jwt|token|unauthorized/i.test(error.message)) { sessionStorage.removeItem("ag-admin-token"); showLogin(); }
    else toast(error.message);
  }
}

function renderInsightList(selector, items, emptyText) {
  $(selector).innerHTML = items.length ? items.join("") : `<p class="insight-empty">${escapeHTML(emptyText)}</p>`;
}

function renderInventory() {
  const query = $("#admin-search").value.trim().toLowerCase();
  const status = $("#admin-status").value;
  const hasFilters = Boolean(query || status);
  const filtered = vehicles.filter(vehicle => {
    const text = `${vehicle.plate || ""} ${vehicle.internal_code || ""} ${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.color || ""} ${vehicle.year || ""} ${statusLabels[vehicle.status] || vehicle.status || ""}`.toLowerCase();
    return (!query || text.includes(query)) && (!status || vehicle.status === status);
  });

  $("#admin-list").innerHTML = filtered.map(vehicle => {
    const margin = vehicleMargin(vehicle);
    const actions = [
      `<button class="icon-button" data-edit="${vehicle.id}" type="button">Editar</button>`,
      vehicle.status !== "sold" ? `<button class="icon-button" data-sell="${vehicle.id}" type="button">Vender</button>` : "",
      vehicle.status !== "sold" ? `<button class="icon-button delete" data-delete="${vehicle.id}" type="button">Excluir</button>` : ""
    ].join("");
    return `<tr>
      <td><div class="admin-vehicle"><img src="${escapeHTML(vehicle.cover || fallbackCover)}" alt="" loading="lazy"><div><strong>${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}</strong><small>${escapeHTML(vehicle.color || "")}</small></div></div></td>
      <td>${escapeHTML(vehicle.plate || "Não informada")}</td>
      <td>${vehicle.year || "—"}/${vehicle.model_year || vehicle.modelYear || vehicle.year || "—"}</td>
      <td><strong>${money.format(vehicle.price || 0)}</strong></td>
      <td><span class="status-pill ${escapeHTML(vehicle.status)}">${statusLabels[vehicle.status] || vehicle.status}</span></td>
      <td><span class="margin-value ${margin !== null && margin < 0 ? "negative" : ""}">${margin === null ? "Incompleta" : money.format(margin)}</span></td>
      <td><div class="table-actions">${actions}</div></td>
    </tr>`;
  }).join("");
  $$("#admin-list img").forEach(image => image.addEventListener("error", () => { image.src = fallbackCover; }, { once: true }));
  $("#inventory-result-count").textContent = hasFilters ? `${pluralize(filtered.length, "veículo encontrado", "veículos encontrados")} de ${vehicles.length}` : pluralize(vehicles.length, "veículo cadastrado", "veículos cadastrados");
  $("#clear-inventory-filters").disabled = !hasFilters;
  $("#admin-empty").textContent = hasFilters ? "Nenhum veículo corresponde aos filtros." : "Nenhum veículo cadastrado.";
  $("#admin-empty").hidden = filtered.length > 0;

  $("#stat-total").textContent = vehicles.length;
  ["available", "reserved", "sold", "hidden"].forEach(name => { $(`#stat-${name}`).textContent = vehicles.filter(vehicle => vehicle.status === name).length; });
  const stock = vehicles.filter(vehicle => ["available", "reserved"].includes(vehicle.status));
  const sold = vehicles.filter(vehicle => vehicle.status === "sold");
  const month = today().slice(0, 7);
  const invested = stock.reduce((sum, vehicle) => sum + vehicleInvestment(vehicle), 0);
  const realizedMargin = sold.reduce((sum, vehicle) => sum + (vehicleMargin(vehicle) || 0), 0);
  const missingPurchase = vehicles.filter(vehicle => !Number(vehicle.purchase_price)).length;
  $("#stat-invested").textContent = money.format(invested);
  $("#stat-margin").textContent = money.format(realizedMargin);
  $("#stat-sold-month").textContent = sold.filter(vehicle => String(vehicle.sale_date || "").startsWith(month)).length;
  $("#stat-views").textContent = vehicles.reduce((sum, vehicle) => sum + (Number(vehicle.views_count) || 0), 0);
  $("#stat-whatsapp").textContent = vehicles.reduce((sum, vehicle) => sum + (Number(vehicle.whatsapp_clicks) || 0), 0);
  $("#stat-financing").textContent = vehicles.reduce((sum, vehicle) => sum + (Number(vehicle.financing_clicks) || 0), 0);
  $("#stat-missing-purchase").textContent = missingPurchase;
  $("#stat-control-health").textContent = missingPurchase ? "Opcional" : "Completo";
  $$('[data-inventory-filter]').forEach(card => card.classList.toggle("active", card.dataset.inventoryFilter === status));

  const top = [...vehicles].sort((a, b) => ((Number(b.views_count) || 0) + (Number(b.whatsapp_clicks) || 0) + (Number(b.financing_clicks) || 0)) - ((Number(a.views_count) || 0) + (Number(a.whatsapp_clicks) || 0) + (Number(a.financing_clicks) || 0))).slice(0, 5);
  renderInsightList("#top-vehicles", top.filter(vehicle => (Number(vehicle.views_count) || 0) + (Number(vehicle.whatsapp_clicks) || 0) + (Number(vehicle.financing_clicks) || 0) > 0).map(vehicle => `<button type="button" class="insight-item" data-edit="${vehicle.id}"><span><strong>${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}</strong><small>${Number(vehicle.views_count) || 0} visitas · ${(Number(vehicle.whatsapp_clicks) || 0) + (Number(vehicle.financing_clicks) || 0)} contatos</small></span><b>${(Number(vehicle.views_count) || 0) + (Number(vehicle.whatsapp_clicks) || 0) + (Number(vehicle.financing_clicks) || 0)}</b></button>`), "As métricas aparecerão conforme o site receber visitas.");
  const stale = [...stock].sort((a, b) => vehicleDays(b) - vehicleDays(a)).slice(0, 5);
  renderInsightList("#stale-vehicles", stale.map(vehicle => `<button type="button" class="insight-item" data-edit="${vehicle.id}"><span><strong>${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model)}</strong><small>${escapeHTML(vehicle.plate || "Sem placa")} · ${money.format(vehicleInvestment(vehicle))} investidos</small></span><b>${vehicleDays(vehicle)} dias</b></button>`), "Nenhum veículo disponível ou reservado.");
  const categories = new Map();
  vehicles.forEach(vehicle => vehicleCosts(vehicle).forEach(item => {
    const category = String(item.category || "Outros").trim() || "Outros";
    categories.set(category, (categories.get(category) || 0) + (Number(item.amount) || 0));
  }));
  const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  renderInsightList("#cost-categories", categoryRows.map(([category, amount]) => `<div class="insight-item"><span><strong>${escapeHTML(category)}</strong><small>Custos dos veículos</small></span><b>${money.format(amount)}</b></div>`), "Os custos cadastrados serão agrupados aqui.");
}

async function loadStoreExpenses() {
  message("#expense-message", "Carregando...");
  try {
    storeExpenses = await database.listStoreExpenses(token);
    $("#expense-updated").textContent = lastUpdateText();
    message("#expense-message");
    renderStoreExpenses();
  } catch (error) {
    storeExpenses = [];
    renderStoreExpenses();
    message("#expense-message", /schema cache|store_expenses/i.test(error.message) ? "Execute a migração do banco para ativar as despesas gerais." : error.message);
  }
}

function renderStoreExpenses() {
  const month = today().slice(0, 7);
  $("#expense-list").innerHTML = storeExpenses.map(expense => `<tr>
    <td>${formatDate(expense.expense_date)}</td><td>${escapeHTML(expense.category || "Outros")}</td><td>${escapeHTML(expense.description || "—")}</td><td><strong>${money.format(expense.amount || 0)}</strong></td><td>${escapeHTML(expense.notes || "—")}</td>
    <td><div class="table-actions"><button class="icon-button" type="button" data-edit-expense="${expense.id}">Editar</button><button class="icon-button delete" type="button" data-delete-expense="${expense.id}">Excluir</button></div></td>
  </tr>`).join("");
  $("#expense-empty").hidden = storeExpenses.length > 0;
  $("#expense-month-total").textContent = money.format(storeExpenses.filter(expense => String(expense.expense_date || "").startsWith(month)).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0));
  $("#expense-all-total").textContent = money.format(storeExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0));
  $("#expense-count").textContent = storeExpenses.length;
}

function resetExpenseForm() {
  $("#expense-form").reset();
  $("#expense-id").value = "";
  $("#expense-date").value = today();
  $("#expense-cancel").hidden = true;
  message("#expense-message");
}

async function loadFinancingLeads() {
  const button = $("#refresh-leads");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Atualizando...";
  try {
    financingLeads = await database.listFinancingLeads(token);
    $("#lead-updated").textContent = lastUpdateText();
    renderFinancingLeads();
  } catch (error) {
    if (/jwt|token|unauthorized/i.test(error.message)) { sessionStorage.removeItem("ag-admin-token"); showLogin(); }
    else toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderFinancingLeads() {
  const rawQuery = ($("#lead-search").value || "").trim().toLowerCase();
  const digits = rawQuery.replace(/\D/g, "");
  const status = $("#lead-status-filter").value || "";
  const filtered = financingLeads.filter(lead => {
    const text = `${lead.vehicle_title || ""} ${lead.vehicle_id || ""} ${leadStatusLabels[lead.status] || lead.status || ""}`.toLowerCase();
    const leadDigits = `${lead.cpf || ""} ${lead.phone || ""}`.replace(/\D/g, "");
    return (!status || lead.status === status) && (!rawQuery || text.includes(rawQuery) || leadDigits.includes(digits));
  });
  $("#lead-list").innerHTML = filtered.map(lead => `<tr><td><div class="lead-vehicle"><strong>${escapeHTML(lead.vehicle_title)}</strong><small>${money.format(lead.vehicle_price || 0)} · ${escapeHTML(lead.vehicle_id || "")}</small></div></td><td>${escapeHTML(formatCPF(lead.cpf))}</td><td>${formatDate(lead.birth_date)}</td><td>${lead.has_cnh ? "Sim" : "Não"}</td><td><a href="https://wa.me/55${escapeHTML(String(lead.phone || "").replace(/\D/g, ""))}" target="_blank" rel="noopener">${escapeHTML(formatPhone(lead.phone))}</a></td><td>${lead.created_at ? dateTime.format(new Date(lead.created_at)) : "—"}</td><td><select class="lead-status-select" data-lead-status="${escapeHTML(lead.id)}">${Object.entries(leadStatusLabels).map(([value, label]) => `<option value="${value}" ${lead.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td></tr>`).join("");
  const hasFilters = Boolean(rawQuery || status);
  $("#lead-result-count").textContent = hasFilters ? `${pluralize(filtered.length, "lead encontrado", "leads encontrados")} de ${financingLeads.length}` : pluralize(financingLeads.length, "lead recebido", "leads recebidos");
  $("#clear-lead-filters").disabled = !hasFilters;
  $("#lead-empty").hidden = filtered.length > 0;
  [["new", "novo"], ["contacting", "em_atendimento"], ["finished", "finalizado"]].forEach(([id, name]) => { $(`#lead-${id}`).textContent = financingLeads.filter(lead => lead.status === name).length; });
  $$('[data-lead-filter]').forEach(card => card.classList.toggle("active", card.dataset.leadFilter === status));
}

function switchView(view) {
  sessionStorage.setItem("ag-admin-view", view);
  $$('[data-view]').forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $$(".inventory-view").forEach(element => { element.hidden = view !== "inventory"; });
  $("#expenses-view").hidden = view !== "expenses";
  $("#financing-view").hidden = view !== "financing";
  if (view === "expenses") loadStoreExpenses();
  if (view === "financing") loadFinancingLeads();
}

function switchFormTab(tabName) {
  $$('[data-form-tab]').forEach(button => button.classList.toggle("active", button.dataset.formTab === tabName));
  $$('[data-form-panel]').forEach(panel => panel.classList.toggle("active", panel.dataset.formPanel === tabName));
}

function currentFormVehicle() {
  return {
    ...activeVehicle,
    status: $("#admin-form-status").value,
    brand: $("#admin-brand").value.trim(), model: $("#admin-model").value.trim(),
    year: Number($("#admin-year").value) || "", model_year: Number($("#admin-model-year").value) || "",
    plate: normalizePlate($("#admin-plate").value), price: Number($("#admin-price").value) || 0,
    purchase_price: toNumberOrNull($("#admin-purchase-price").value), purchase_date: $("#admin-purchase-date").value || null,
    sale_price: toNumberOrNull($("#admin-sale-price").value), sale_date: $("#admin-sale-date").value || null,
    cost_items: costItems
  };
}

function updateMetricsPreview(vehicle = currentFormVehicle()) {
  const display = { ...vehicle, cost_items: costItems };
  const margin = vehicleMargin(display);
  const percent = vehicleMarginPercent(display);
  $("#metric-views").textContent = Number(vehicle.views_count) || 0;
  $("#metric-whatsapp").textContent = Number(vehicle.whatsapp_clicks) || 0;
  $("#metric-financing").textContent = Number(vehicle.financing_clicks) || 0;
  $("#metric-days").textContent = vehicleDays(display);
  $("#metric-margin").textContent = margin === null ? "Incompleta" : money.format(margin);
  $("#metric-margin-percent").textContent = percent === null ? "Incompleta" : `${percent.toFixed(1).replace(".", ",")}%`;
  const sources = Object.entries(vehicle.traffic_sources || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  renderInsightList("#metric-sources", sources.map(([source, count]) => `<div class="insight-item"><span><strong>${escapeHTML(sourceLabels[source] || source)}</strong></span><b>${Number(count) || 0}</b></div>`), "As origens aparecerão após novas visitas.");
}

function normalizedText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseBRMoney(value = "") {
  let clean = String(value).replace(/[^\d,.-]/g, "");
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, "");
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function inferCostCategory(description) {
  const text = normalizedText(description);
  const rules = [
    [/transfer|document|despach|licenciamento|ipva/, "Despachante/Documentação"],
    [/lato|funilar|pintur|poliment|para.?choque|parachoque/, "Lataria"],
    [/mecan|motor|cambio|embreagem|revisao/, "Mecânica"],
    [/eletric|sensor|modulo|bateria|alternador/, "Elétrica"],
    [/radiador|arrefec|mangueira/, "Radiador"],
    [/pneu/, "Pneus"],
    [/suspens|amortec/, "Suspensão"],
    [/lavagem|lavador|higien/, "Higienização"],
    [/combust|gasolina|etanol|diesel/, "Combustível"],
    [/comiss/, "Comissão"],
    [/anuncio|facebook|instagram|google/, "Anúncios"],
    [/acessor|emblema|friso|som|multimidia|mapa/, "Acessórios"],
    [/peca|lanterna|farol|lente|suporte|capa|olho de gato/, "Peças"]
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "Outros";
}

function parseBulkCosts(value) {
  let purchase = null;
  let skipped = 0;
  const items = [];
  String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => {
    const match = line.match(/(?:R\$\s*)?(-?\d[\d.]*?(?:,\d{1,2})?)\s*$/i);
    if (!match) { skipped += 1; return; }
    const amount = parseBRMoney(match[1]);
    const description = line.slice(0, match.index).replace(/[\s\t:;|-]+$/g, "").trim();
    if (amount === null || !description) { skipped += 1; return; }
    const key = normalizedText(description);
    if (/^(compra|preco de compra|valor de compra|aquisicao)$/.test(key)) { purchase = amount; return; }
    const category = inferCostCategory(description);
    const explicitValue = /R\$/i.test(line) || /[,.]\d{1,2}\s*$/.test(line) || /\t|\s{2,}/.test(line);
    if (!explicitValue && category === "Outros") { skipped += 1; return; }
    items.push({ category, description: description.charAt(0).toUpperCase() + description.slice(1), amount, date: "", note: "" });
  });
  return { items, purchase, skipped };
}

function renderCostRows() {
  $("#cost-list").innerHTML = costItems.map((item, index) => `<div class="cost-row" data-cost-index="${index}">
    <label>Categoria<input data-cost-field="category" list="cost-category-options" value="${escapeHTML(item.category || "")}" placeholder="Ex: Mecânica"></label>
    <label>Descrição<input data-cost-field="description" value="${escapeHTML(item.description || "")}" placeholder="Ex: Revisão"></label>
    <label>Valor (R$)<input data-cost-field="amount" type="number" min="0" step="0.01" value="${Number(item.amount) || ""}"></label>
    <label>Data<input data-cost-field="date" type="date" value="${escapeHTML(item.date || "")}"></label>
    <label>Observação<input data-cost-field="note" value="${escapeHTML(item.note || item.notes || "")}" placeholder="Opcional"></label>
    <button type="button" class="icon-button delete" data-remove-cost="${index}">Remover</button>
  </div>`).join("");
  updateCostTotal();
}

function updateCostTotal() {
  $("#cost-total").textContent = `Total: ${money.format(costItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}`;
  updateMetricsPreview();
}

function renderExistingImages() {
  $("#existing-images").innerHTML = photoItems.map((item, index) => `<div class="existing-image" draggable="true" data-photo-id="${item.id}"><span class="drag-handle" title="Arraste para ordenar" aria-hidden="true">↕</span>${index === 0 ? '<span class="cover-label">Capa principal</span>' : `<span class="photo-position">${index + 1}</span>`}<img src="${escapeHTML(item.preview)}" alt="Foto ${index + 1}"><button type="button" data-remove-photo="${item.id}" aria-label="Remover foto">×</button></div>`).join("");
}

function openForm(vehicle = null, tab = "essential") {
  photoItems.filter(item => item.type === "file").forEach(item => URL.revokeObjectURL(item.preview));
  $("#vehicle-form").reset();
  activeVehicle = vehicle;
  photoItems = [];
  originalImages = [];
  costItems = [];
  $("#form-title").textContent = vehicle ? "Editar veículo" : "Cadastrar veículo";
  $("#vehicle-id").value = vehicle?.id || "";
  if (vehicle) {
    const fields = {
      "admin-plate": vehicle.plate, "admin-brand": vehicle.brand, "admin-model": vehicle.model,
      "admin-year": vehicle.year, "admin-model-year": vehicle.model_year || vehicle.modelYear || vehicle.year,
      "admin-price": vehicle.price, "admin-mileage": vehicle.mileage, "admin-transmission": vehicle.transmission,
      "admin-fuel": vehicle.fuel, "admin-color": vehicle.color, "admin-internal-code": vehicle.internal_code,
      "admin-renavam": vehicle.renavam, "admin-chassis": vehicle.chassis,
      "admin-description": vehicle.description, "admin-purchase-price": vehicle.purchase_price,
      "admin-purchase-date": vehicle.purchase_date, "admin-sale-price": vehicle.sale_price,
      "admin-sale-date": vehicle.sale_date, "admin-payment-method": vehicle.payment_method,
      "admin-payment-terms": vehicle.payment_terms,
      "admin-down-payment": vehicle.down_payment, "admin-sale-channel": vehicle.sale_channel,
      "admin-repair-allowance-amount": vehicle.repair_allowance_amount,
      "admin-repair-allowance-description": vehicle.repair_allowance_description,
      "admin-sale-notes": vehicle.sale_notes, "admin-buyer-name": vehicle.buyer_name || vehicle.sale_buyer,
      "admin-buyer-cpf": formatCPF(vehicle.buyer_cpf), "admin-buyer-phone": formatPhone(vehicle.buyer_phone),
      "admin-buyer-email": vehicle.buyer_email, "admin-buyer-address": vehicle.buyer_address
    };
    Object.entries(fields).forEach(([id, value]) => { $(`#${id}`).value = value ?? ""; });
    $("#admin-form-status").value = vehicle.status || "available";
    $("#admin-features").value = (vehicle.features || []).join("\n");
    $("#admin-featured").checked = Boolean(vehicle.featured);
    costItems = vehicleCosts(vehicle).map(item => ({ ...item }));
    originalImages = [...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean);
    photoItems = originalImages.map(url => ({ id: crypto.randomUUID(), type: "url", value: url, preview: url }));
  } else {
    $("#admin-form-status").value = "available";
  }
  renderCostRows();
  renderExistingImages();
  updateMetricsPreview(vehicle || {});
  message("#vehicle-message");
  message("#bulk-cost-message");
  switchFormTab(tab);
  $("#vehicle-form-modal").showModal();
}

function slugify(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function documentData() {
  return {
    type: "AG Motors Curitiba Ltda.", buyer: $("#admin-buyer-name").value.trim() || "________________________________",
    cpf: $("#admin-buyer-cpf").value.trim() || "________________", phone: $("#admin-buyer-phone").value.trim() || "________________",
    email: $("#admin-buyer-email").value.trim() || "________________", address: $("#admin-buyer-address").value.trim() || "________________________________",
    vehicle: `${$("#admin-brand").value.trim()} ${$("#admin-model").value.trim()}`.trim() || "veículo não informado",
    year: `${$("#admin-year").value || "____"}/${$("#admin-model-year").value || "____"}`, plate: normalizePlate($("#admin-plate").value) || "_______",
    renavam: $("#admin-renavam").value.trim() || "não informado", chassis: $("#admin-chassis").value.trim().toUpperCase() || "não informado",
    color: $("#admin-color").value.trim() || "não informada", fuel: $("#admin-fuel").value.trim() || "não informado", mileage: Number($("#admin-mileage").value) || 0,
    salePrice: Number($("#admin-sale-price").value) || Number($("#admin-price").value) || 0,
    downPayment: Number($("#admin-down-payment").value) || 0,
    saleDate: formatDate($("#admin-sale-date").value || today()), paymentMethod: $("#admin-payment-method").value || "não informada",
    paymentTerms: $("#admin-payment-terms").value.trim(), repairAllowance: Number($("#admin-repair-allowance-amount").value) || 0,
    repairDescription: $("#admin-repair-allowance-description").value.trim(),
    notes: $("#admin-sale-notes").value.trim()
  };
}

function contractBody(data) {
  const payment = data.paymentTerms || `Pagamento por ${data.paymentMethod}.`;
  const originalPrice = data.salePrice + data.repairAllowance;
  const allowance = data.repairAllowance || data.repairDescription ? `<section class="clause allowance"><h2>Abatimento vinculado a reparo conhecido</h2><p>As partes ajustam abatimento de <strong>${money.format(data.repairAllowance)}</strong> no preço originalmente considerado, especificamente para que o COMPRADOR providencie, por sua conta, o seguinte reparo ou condição conhecida: <strong>${escapeHTML(data.repairDescription || "________________________________")}</strong>.</p><p>O valor é registrado como composição econômica vinculada a esse reparo específico, e não como desconto comercial genérico. O COMPRADOR declara que recebeu informação clara sobre essa condição e assume sua execução e os respectivos custos, ainda que superiores ao abatimento. Esta cláusula limita-se ao item expressamente descrito e não afasta a garantia legal, vícios ocultos distintos, direitos indisponíveis nem responsabilidades relacionadas à segurança do produto.</p></section>` : "";
  return `<section><h2>Identificação das partes e do veículo</h2><p><strong>VENDEDORA:</strong> AG Motors Curitiba Ltda., CNPJ 45.508.848/0001-64, com endereço na Rua Arnaldo Thá, 1257, Fazendinha, Curitiba/PR.</p><p><strong>COMPRADOR(A):</strong> ${escapeHTML(data.buyer)}, CPF ${escapeHTML(data.cpf)}, endereço ${escapeHTML(data.address)}, telefone ${escapeHTML(data.phone)}, e-mail ${escapeHTML(data.email)}.</p><p><strong>VEÍCULO:</strong> ${escapeHTML(data.vehicle)}, ano/modelo ${escapeHTML(data.year)}, cor ${escapeHTML(data.color)}, combustível ${escapeHTML(data.fuel)}, placa ${escapeHTML(data.plate)}, Renavam ${escapeHTML(data.renavam)}, chassi ${escapeHTML(data.chassis)}${data.mileage ? `, quilometragem indicada de ${numberFormat(data.mileage)} km` : ""}.</p></section>
  <section><h2>Preço e pagamento</h2>${data.repairAllowance ? `<p>Valor originalmente considerado: <strong>${money.format(originalPrice)}</strong>.<br>Abatimento vinculado ao reparo conhecido: <strong>${money.format(data.repairAllowance)}</strong>.<br>Valor final da venda após o abatimento: <strong>${money.format(data.salePrice)}</strong>.</p>` : `<p>Preço final ajustado: <strong>${money.format(data.salePrice)}</strong>.</p>`}<p>${escapeHTML(payment)}</p>${data.downPayment ? `<p>Sinal ou entrada recebida: <strong>${money.format(data.downPayment)}</strong>, computado no preço da venda.</p>` : ""}</section>
  ${allowance}
  <section class="clause"><h2>Cláusula 1ª: objeto, vistoria e informação</h2><p>A VENDEDORA vende ao COMPRADOR o veículo identificado neste contrato. O COMPRADOR declara que pôde vistoriá-lo e recebeu informações sobre seu estado de conservação, sem prejuízo dos direitos relativos à garantia legal e a vícios ocultos.</p></section>
  <section class="clause"><h2>Cláusula 2ª: entrega e responsabilidades</h2><p>A VENDEDORA responde pelos débitos e multas gerados até a data e hora da entrega, ainda que lançados posteriormente. A partir da entrega, o COMPRADOR assume a guarda, uso, multas, tributos, danos e demais responsabilidades decorrentes de fatos novos relacionados ao veículo.</p></section>
  <section class="clause"><h2>Cláusula 3ª: transferência</h2><p>As despesas de transferência e financiamento são de responsabilidade do COMPRADOR, salvo ajuste escrito diferente. As partes se obrigam a fornecer e assinar os documentos necessários nos prazos aplicáveis.</p></section>
  <section class="clause"><h2>Cláusula 4ª: uso e manutenção</h2><p>A VENDEDORA não responde por danos posteriores causados por acidente, negligência, mau uso, modificações, falta de fluidos ou descumprimento comprovado das manutenções recomendadas, preservadas as responsabilidades legais que não possam ser excluídas.</p></section>
  <section class="clause"><h2>Cláusula 5ª: garantia legal e garantia contratual</h2><p>A garantia legal de produto durável aplica-se ao veículo usado nos termos do Código de Defesa do Consumidor. O prazo para reclamar de vícios aparentes ou de fácil constatação é de 90 dias a partir da entrega; para vício oculto, a contagem inicia quando ele ficar evidenciado, observada a legislação aplicável.</p><p>Sem prejuízo da garantia legal, a VENDEDORA concede garantia contratual adicional de <strong>3 (três) meses ou 3.000 (três mil) km rodados, o que ocorrer primeiro</strong>, para o motor (bloco e componentes internos) e o câmbio (carcaça e componentes internos). O limite de quilometragem refere-se somente a esta cobertura contratual adicional e não reduz direitos legais.</p><p>A cobertura contratual adicional não abrange desgaste natural, itens de manutenção, sistemas auxiliares nem falhas comprovadamente decorrentes de acidente, abuso, superaquecimento por negligência, falta de óleo ou fluido, modificações, reparos não autorizados ou ausência de manutenção adequada. O COMPRADOR deverá comunicar o problema antes de autorizar reparo por terceiros e apresentar o veículo à VENDEDORA para análise, ressalvadas situações urgentes e direitos legalmente assegurados.</p></section>
  ${data.downPayment ? `<section class="clause"><h2>Cláusula 6ª: sinal</h2><p>O sinal segue os arts. 417 a 420 do Código Civil. Em caso de inexecução imputável a quem o deu, a parte inocente poderá retê-lo; se imputável a quem o recebeu, poderá ser exigida sua devolução mais o equivalente, observada a legislação aplicável.</p></section>` : ""}
  ${data.notes ? `<section><h2>Observações particulares</h2><p>${escapeHTML(data.notes)}</p></section>` : ""}
  <p>As partes firmam este instrumento em duas vias de igual teor, elegendo o foro competente na forma da legislação aplicável.</p>`;
}

function numberFormat(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function generateDocument(kind) {
  const data = documentData();
  const configs = {
    contract: { title: "Contrato particular de compra e venda de veículo automotor", body: contractBody(data) },
    deposit: { title: "Recibo de sinal", body: `<p>Recebemos de <strong>${escapeHTML(data.buyer)}</strong>, CPF ${escapeHTML(data.cpf)}, a quantia de <strong>${money.format(data.downPayment)}</strong>, como sinal para a compra do veículo <strong>${escapeHTML(data.vehicle)}</strong>, ano ${escapeHTML(data.year)}, placa ${escapeHTML(data.plate)}.</p><p>Valor total negociado: ${money.format(data.salePrice)}.</p>` },
    payment: { title: "Recibo de pagamento", body: `<p>Recebemos de <strong>${escapeHTML(data.buyer)}</strong>, CPF ${escapeHTML(data.cpf)}, a quantia de <strong>${money.format(data.salePrice)}</strong>, referente à compra do veículo <strong>${escapeHTML(data.vehicle)}</strong>, ano ${escapeHTML(data.year)}, placa ${escapeHTML(data.plate)}, por meio de ${escapeHTML(data.paymentMethod)}.</p>` }
  };
  const config = configs[kind];
  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) { toast("O navegador bloqueou a janela do documento."); return; }
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${config.title}</title><style>
    body{font:15px/1.55 Arial,sans-serif;color:#171717;max-width:780px;margin:36px auto;padding:0 28px}
    header{border-bottom:3px solid #c51d2d;padding-bottom:18px;margin-bottom:28px}h1{font-size:24px;line-height:1.2;margin:0 0 8px;text-transform:uppercase}header p{margin:2px 0;color:#444}
    .content{text-align:justify}.content h2{font-size:15px;margin:22px 0 6px}.content p{margin:7px 0}.allowance{padding:12px 15px;border:1px solid #c99a23;background:#fff9e8}.meta{margin:28px 0}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:80px}.signature{border-top:1px solid #222;text-align:center;padding-top:8px}.notice{font-size:11px;color:#666;margin-top:45px}
    .print{position:fixed;right:20px;top:20px;padding:10px 16px;border:0;background:#171717;color:#fff;cursor:pointer}@media print{.print{display:none}body{margin:0 auto}.allowance{break-inside:avoid}}
  </style></head><body><button class="print" onclick="window.print()">Imprimir</button><header><h1>${config.title}</h1><p><strong>AG Motors Curitiba Ltda.</strong> · CNPJ 45.508.848/0001-64</p><p>Rua Arnaldo Thá, 1257, Fazendinha, Curitiba/PR · (41) 99615-5327</p></header><main class="content">${config.body}<p class="meta">Curitiba/PR, ${escapeHTML(data.saleDate)}.</p></main><div class="signatures"><div class="signature">AG Motors Curitiba Ltda.<br>VENDEDORA</div><div class="signature">${escapeHTML(data.buyer)}<br>COMPRADOR(A)</div></div><p class="notice">Modelo gerado com os dados informados no sistema. Revise os dados e submeta o modelo a um profissional jurídico antes de adotá-lo como padrão definitivo.</p></body></html>`);
  popup.document.close();
}

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  message("#login-message", "Entrando...");
  try { const session = await database.signIn($("#login-email").value, $("#login-password").value); setSession(session.access_token); message("#login-message"); showAdmin(); }
  catch (error) { message("#login-message", error.message); }
});
$("#logout-button").addEventListener("click", () => { sessionStorage.removeItem("ag-admin-token"); token = ""; showLogin(); });
$$('[data-view]').forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
$$('[data-form-tab]').forEach(button => button.addEventListener("click", () => switchFormTab(button.dataset.formTab)));
$("#new-vehicle").addEventListener("click", () => openForm());
$("#refresh-leads").addEventListener("click", loadFinancingLeads);
["#admin-search", "#admin-status"].forEach(selector => $(selector).addEventListener("input", renderInventory));
["#lead-search", "#lead-status-filter"].forEach(selector => $(selector).addEventListener("input", renderFinancingLeads));
$("#clear-inventory-filters").addEventListener("click", () => { $("#admin-search").value = ""; $("#admin-status").value = ""; renderInventory(); });
$("#clear-lead-filters").addEventListener("click", () => { $("#lead-search").value = ""; $("#lead-status-filter").value = ""; renderFinancingLeads(); });
$$('[data-inventory-filter]').forEach(card => {
  const apply = () => { $("#admin-status").value = card.dataset.inventoryFilter; renderInventory(); };
  card.addEventListener("click", apply); card.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); apply(); } });
});
$$('[data-lead-filter]').forEach(card => {
  const apply = () => { $("#lead-status-filter").value = card.dataset.leadFilter; renderFinancingLeads(); };
  card.addEventListener("click", apply); card.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); apply(); } });
});

$("#admin-list").addEventListener("click", event => {
  const edit = event.target.closest("[data-edit]");
  const sell = event.target.closest("[data-sell]");
  const remove = event.target.closest("[data-delete]");
  if (edit) openForm(vehicles.find(vehicle => String(vehicle.id) === edit.dataset.edit));
  if (sell) {
    const vehicle = vehicles.find(item => String(item.id) === sell.dataset.sell);
    openForm(vehicle, "sale");
    $("#admin-form-status").value = "sold";
    if (!$("#admin-sale-date").value) $("#admin-sale-date").value = today();
  }
  if (remove) { deletingId = remove.dataset.delete; $("#delete-modal").showModal(); }
});
$("#top-vehicles").addEventListener("click", event => { const button = event.target.closest("[data-edit]"); if (button) openForm(vehicles.find(vehicle => String(vehicle.id) === button.dataset.edit)); });
$("#stale-vehicles").addEventListener("click", event => { const button = event.target.closest("[data-edit]"); if (button) openForm(vehicles.find(vehicle => String(vehicle.id) === button.dataset.edit)); });

$("#admin-form-status").addEventListener("change", event => {
  if (event.target.value === "sold") { if (!$("#admin-sale-date").value) $("#admin-sale-date").value = today(); switchFormTab("sale"); }
  updateMetricsPreview();
});
["#admin-plate", "#admin-purchase-price", "#admin-purchase-date", "#admin-sale-price", "#admin-sale-date", "#admin-price"].forEach(selector => $(selector).addEventListener("input", () => updateMetricsPreview()));
$("#admin-plate").addEventListener("input", event => { event.target.value = normalizePlate(event.target.value); });
$("#admin-buyer-cpf").addEventListener("input", event => { event.target.value = formatCPF(event.target.value); });
$("#admin-buyer-phone").addEventListener("input", event => { event.target.value = formatPhone(event.target.value); });
$$('[data-document]').forEach(button => button.addEventListener("click", () => generateDocument(button.dataset.document)));
$("#add-buyer").addEventListener("click", () => switchFormTab("buyer"));
$$('.admin-modal-close').forEach(button => button.addEventListener("click", () => $("#vehicle-form-modal").close()));
$("#existing-images").insertAdjacentHTML("beforebegin", '<p class="photo-order-help">Arraste as fotos para organizar. A primeira imagem será a capa principal.</p>');

$("#admin-images").addEventListener("change", event => {
  [...event.target.files].forEach(file => photoItems.push({ id: crypto.randomUUID(), type: "file", value: file, preview: URL.createObjectURL(file) }));
  event.target.value = "";
  renderExistingImages();
});
$("#add-cost-item").addEventListener("click", () => { costItems.push({ category: "", description: "", amount: null, date: today(), note: "" }); renderCostRows(); });
$("#import-costs").addEventListener("click", () => {
  const parsed = parseBulkCosts($("#bulk-costs").value);
  if (!parsed.items.length && parsed.purchase === null) { message("#bulk-cost-message", "Nenhuma linha com descrição e valor foi reconhecida."); return; }
  if ($("#bulk-cost-mode").value === "replace") costItems = parsed.items;
  else costItems.push(...parsed.items);
  if (parsed.purchase !== null) $("#admin-purchase-price").value = parsed.purchase;
  renderCostRows();
  const purchaseText = parsed.purchase !== null ? " e preço de compra preenchido" : "";
  const skippedText = parsed.skipped ? ` ${parsed.skipped} linha(s) não reconhecida(s).` : "";
  message("#bulk-cost-message", `${parsed.items.length} custo(s) importado(s)${purchaseText}.${skippedText}`);
});
$("#cost-list").addEventListener("input", event => {
  const row = event.target.closest("[data-cost-index]");
  if (!row || !event.target.dataset.costField) return;
  const field = event.target.dataset.costField;
  costItems[Number(row.dataset.costIndex)][field] = field === "amount" ? toNumberOrNull(event.target.value) : event.target.value;
  updateCostTotal();
});
$("#cost-list").addEventListener("click", event => { const button = event.target.closest("[data-remove-cost]"); if (button) { costItems.splice(Number(button.dataset.removeCost), 1); renderCostRows(); } });
$("#existing-images").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-photo]"); if (!button) return;
  const index = photoItems.findIndex(item => item.id === button.dataset.removePhoto); if (index < 0) return;
  const [removed] = photoItems.splice(index, 1); if (removed.type === "file") URL.revokeObjectURL(removed.preview); renderExistingImages();
});
$("#existing-images").addEventListener("dragstart", event => { const item = event.target.closest("[data-photo-id]"); if (!item) return; draggedPhotoId = item.dataset.photoId; event.dataTransfer.effectAllowed = "move"; requestAnimationFrame(() => item.classList.add("dragging")); });
$("#existing-images").addEventListener("dragover", event => { const target = event.target.closest("[data-photo-id]"); if (!target || target.dataset.photoId === draggedPhotoId) return; event.preventDefault(); $$(".existing-image.drag-target").forEach(item => item.classList.remove("drag-target")); target.classList.add("drag-target"); });
$("#existing-images").addEventListener("drop", event => {
  const target = event.target.closest("[data-photo-id]"); if (!target || target.dataset.photoId === draggedPhotoId) return;
  event.preventDefault(); const from = photoItems.findIndex(item => item.id === draggedPhotoId); if (from < 0) return;
  const [moved] = photoItems.splice(from, 1); let to = photoItems.findIndex(item => item.id === target.dataset.photoId);
  if (event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2) to += 1;
  photoItems.splice(Math.max(0, to), 0, moved); renderExistingImages();
});
$("#existing-images").addEventListener("dragend", () => { draggedPhotoId = ""; $$(".existing-image.dragging,.existing-image.drag-target").forEach(item => item.classList.remove("dragging", "drag-target")); });

$("#cancel-delete").addEventListener("click", () => $("#delete-modal").close());
$("#confirm-delete").addEventListener("click", async () => {
  try {
    const vehicle = vehicles.find(item => String(item.id) === String(deletingId));
    if (vehicle?.status === "sold") throw new Error("Veículos vendidos ficam protegidos no histórico.");
    await database.deleteVehicle(deletingId, token);
    if (vehicle) await Promise.allSettled([...new Set([vehicle.cover, ...(vehicle.images || [])])].filter(Boolean).map(url => database.deleteImage(url, token)));
    $("#delete-modal").close(); toast("Veículo excluído."); loadVehicles();
  } catch (error) { toast(error.message); }
});

$("#lead-list").addEventListener("change", async event => {
  const select = event.target.closest("[data-lead-status]"); if (!select) return;
  try { await database.updateFinancingLeadStatus(select.dataset.leadStatus, select.value, token); toast("Status do lead atualizado."); loadFinancingLeads(); }
  catch (error) { toast(error.message); }
});

$("#expense-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.submitter;
  const original = button.textContent;
  button.disabled = true; button.textContent = "Salvando...";
  try {
    const amount = toNumberOrNull($("#expense-amount").value);
    if (!$("#expense-date").value || !$("#expense-category").value || !amount) throw new Error("Informe data, categoria e valor desta despesa.");
    await database.saveStoreExpense({ id: $("#expense-id").value || undefined, expense_date: $("#expense-date").value, category: $("#expense-category").value, description: $("#expense-description").value.trim(), amount, notes: $("#expense-notes").value.trim() }, token);
    resetExpenseForm(); toast("Despesa salva."); await loadStoreExpenses();
  } catch (error) { message("#expense-message", /schema cache|store_expenses/i.test(error.message) ? "Execute a migração do banco para ativar as despesas gerais." : error.message); }
  finally { button.disabled = false; button.textContent = original; }
});
$("#expense-cancel").addEventListener("click", resetExpenseForm);
$("#expense-list").addEventListener("click", async event => {
  const edit = event.target.closest("[data-edit-expense]");
  const remove = event.target.closest("[data-delete-expense]");
  if (edit) {
    const expense = storeExpenses.find(item => String(item.id) === edit.dataset.editExpense); if (!expense) return;
    $("#expense-id").value = expense.id; $("#expense-date").value = expense.expense_date || ""; $("#expense-category").value = expense.category || ""; $("#expense-description").value = expense.description || ""; $("#expense-amount").value = expense.amount || ""; $("#expense-notes").value = expense.notes || ""; $("#expense-cancel").hidden = false;
  }
  if (remove && window.confirm("Excluir esta despesa?")) { try { await database.deleteStoreExpense(remove.dataset.deleteExpense, token); toast("Despesa excluída."); loadStoreExpenses(); } catch (error) { toast(error.message); } }
});

$("#vehicle-form").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.submitter || $('#vehicle-form button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  try {
    const id = $("#vehicle-id").value;
    const plate = normalizePlate($("#admin-plate").value);
    if (plate && vehicles.some(vehicle => String(vehicle.id) !== id && normalizePlate(vehicle.plate) === plate)) throw new Error(`A placa ${plate} já está cadastrada.`);
    const pending = photoItems.filter(item => item.type === "file");
    for (let index = 0; index < pending.length; index += 1) {
      message("#vehicle-message", `Enviando foto ${index + 1} de ${pending.length}...`);
      submitButton.textContent = `${index + 1}/${pending.length} fotos`;
      pending[index].value = await database.uploadImage(pending[index].value, token);
      pending[index].type = "url";
    }
    const images = photoItems.map(item => item.value);
    if (!images.length) throw new Error("Adicione ao menos uma foto do veículo.");
    const brand = $("#admin-brand").value.trim();
    const model = $("#admin-model").value.trim();
    const year = Number($("#admin-year").value);
    const payload = {
      id: id || undefined, slug: `${slugify(brand)}-${slugify(model)}-${plate || year}-${Date.now().toString().slice(-5)}`,
      plate: plate || null, brand, model, year, model_year: Number($("#admin-model-year").value), price: Number($("#admin-price").value),
      mileage: Number($("#admin-mileage").value) || null, transmission: $("#admin-transmission").value.trim(), fuel: $("#admin-fuel").value.trim(), color: $("#admin-color").value.trim(), internal_code: $("#admin-internal-code").value.trim(), status: $("#admin-form-status").value,
      description: $("#admin-description").value.trim(), features: $("#admin-features").value.split("\n").map(value => value.trim()).filter(Boolean), featured: $("#admin-featured").checked,
      purchase_price: toNumberOrNull($("#admin-purchase-price").value), purchase_date: $("#admin-purchase-date").value || null,
      sale_price: toNumberOrNull($("#admin-sale-price").value), sale_date: $("#admin-sale-date").value || null, sale_buyer: $("#admin-buyer-name").value.trim(), sale_channel: $("#admin-sale-channel").value.trim(), sale_notes: $("#admin-sale-notes").value.trim(),
      cost_items: costItems.map(item => ({ category: String(item.category || "").trim(), description: String(item.description || "").trim(), amount: Number(item.amount) || 0, date: item.date || null, note: String(item.note || item.notes || "").trim() })).filter(item => item.category || item.description || item.amount || item.note),
      cover: images[0], images
    };
    const optionalNewFields = {
      renavam: $("#admin-renavam").value.trim(), chassis: $("#admin-chassis").value.trim().toUpperCase(),
      payment_method: $("#admin-payment-method").value, payment_terms: $("#admin-payment-terms").value.trim(),
      down_payment: toNumberOrNull($("#admin-down-payment").value), repair_allowance_amount: toNumberOrNull($("#admin-repair-allowance-amount").value), repair_allowance_description: $("#admin-repair-allowance-description").value.trim(),
      buyer_name: $("#admin-buyer-name").value.trim(), buyer_cpf: $("#admin-buyer-cpf").value.replace(/\D/g, ""), buyer_phone: $("#admin-buyer-phone").value.replace(/\D/g, ""), buyer_email: $("#admin-buyer-email").value.trim(), buyer_address: $("#admin-buyer-address").value.trim()
    };
    Object.entries(optionalNewFields).forEach(([key, value]) => { if (value !== "" && value !== null) payload[key] = value; });
    if (payload.id) delete payload.slug;
    message("#vehicle-message", "Salvando os dados..."); submitButton.textContent = "Salvando...";
    await database.saveVehicle(payload, token);
    await Promise.allSettled(originalImages.filter(url => !images.includes(url)).map(url => database.deleteImage(url, token)));
    $("#vehicle-form-modal").close(); toast(payload.status === "sold" ? "Venda salva no histórico." : "Veículo salvo com sucesso."); loadVehicles();
  } catch (error) {
    const text = /vehicles_plate_unique|duplicate key/i.test(error.message) ? "Esta placa já está cadastrada." : /schema cache/i.test(error.message) ? `${error.message} Execute a migração atualizada no Supabase.` : error.message;
    message("#vehicle-message", text); $("#vehicle-message").scrollIntoView({ block: "nearest", behavior: "smooth" });
  } finally { submitButton.disabled = false; submitButton.textContent = originalText; }
});

resetExpenseForm();
if (!database.configured) { $("#config-alert").hidden = false; $('#login-form button').disabled = true; }
if (token && database.configured) showAdmin(); else showLogin();
