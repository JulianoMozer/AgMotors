import { config } from "./config.js";

const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const baseHeaders = { apikey: config.supabaseAnonKey, "Content-Type": "application/json" };

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
    return request(`/rest/v1/vehicles?select=*&order=featured.desc,created_at.desc${filter}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
