import { config } from "./config.js";

const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const baseHeaders = { apikey: config.supabaseAnonKey, "Content-Type": "application/json" };
const publicVehicleFields = "id,slug,brand,model,year,model_year,price,mileage,transmission,fuel,color,description,features,cover,images,featured,status,created_at";

async function request(path, options = {}) {
  if (!configured) throw new Error("Supabase não configurado.");
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.msg || error.error_description || "Não foi possível concluir a operação.");
  }
  if (response.status === 204) return null;
  return response.json();
}

export const database = {
  configured,
  async listVehicles({ includeInactive = false, token = "" } = {}) {
    const filter = includeInactive ? "" : "&status=eq.available";
    const fields = includeInactive ? "*" : publicVehicleFields;
    return request(`/rest/v1/vehicles?select=${fields}&order=featured.desc,created_at.desc${filter}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
  async signIn(email, password) {
    return request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  async saveVehicle(vehicle, token) {
    const { id, ...payload } = vehicle;
    const path = id ? `/rest/v1/vehicles?id=eq.${encodeURIComponent(id)}` : "/rest/v1/vehicles";
    return request(path, { method: id ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, Prefer: "return=representation" }, body: JSON.stringify(payload) });
  },
  async deleteVehicle(id, token) {
    return request(`/rest/v1/vehicles?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, Prefer: "return=minimal" } });
  },
  async createFinancingLead(lead) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/financing_leads`, {
      method: "POST",
      headers: { ...baseHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(lead)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.msg || error.error_description || "NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o.");
    }
    return null;
  },
  async listFinancingLeads(token) {
    return request("/rest/v1/financing_leads?select=*&order=created_at.desc", { headers: { Authorization: `Bearer ${token}` } });
  },
  async updateFinancingLeadStatus(id, status, token) {
    return request(`/rest/v1/financing_leads?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, Prefer: "return=representation" }, body: JSON.stringify({ status }) });
  },
  async trackVehicleEvent(vehicleId, eventName, source = "direct") {
    if (!configured || !vehicleId) return null;
    return request("/rest/v1/rpc/track_vehicle_event", {
      method: "POST",
      body: JSON.stringify({ p_vehicle_id: vehicleId, p_event: eventName, p_source: source })
    }).catch(() => null);
  },
  async listStoreExpenses(token) {
    return request("/rest/v1/store_expenses?select=*&order=expense_date.desc,created_at.desc", { headers: { Authorization: `Bearer ${token}` } });
  },
  async saveStoreExpense(expense, token) {
    const { id, ...payload } = expense;
    const path = id ? `/rest/v1/store_expenses?id=eq.${encodeURIComponent(id)}` : "/rest/v1/store_expenses";
    return request(path, { method: id ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, Prefer: "return=representation" }, body: JSON.stringify(payload) });
  },
  async deleteStoreExpense(id, token) {
    return request(`/rest/v1/store_expenses?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, Prefer: "return=minimal" } });
  },
  async uploadImage(file, token) {
    const safeName = `${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
    const path = `vehicles/${safeName}`;
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${path}`, { method: "POST", headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": file.type, "x-upsert": "false" }, body: file });
    if (!response.ok) throw new Error("Falha ao enviar uma das imagens.");
    return `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${path}`;
  },
  async deleteImage(url, token) {
    const marker = `/storage/v1/object/public/${config.storageBucket}/`;
    if (!url.startsWith(config.supabaseUrl) || !url.includes(marker)) return;
    const objectPath = url.split(marker)[1].split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${objectPath}`, { method: "DELETE", headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 404) throw new Error("Não foi possível remover uma imagem antiga.");
  }
};
